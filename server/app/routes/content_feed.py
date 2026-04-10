from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from flask import Blueprint, current_app, g, jsonify, request

from app.auth import get_supabase_admin, require_auth, require_role

bp = Blueprint("content_feed", __name__)

ALLOWED_POST_TYPES = {"video", "article", "post", "resource"}
DEFAULT_BUCKET = "tenant-content"


def _result_data(result: Any) -> list[dict[str, Any]]:
    if result is None:
        return []
    data = getattr(result, "data", None)
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _is_postgrest_missing_response(exc: Exception) -> bool:
    text = str(exc).lower()
    return "missing response" in text and (
        "'code': '204'" in text or '"code": "204"' in text
    )


def _to_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _validate_post_type(value: str | None) -> str:
    post_type = (value or "post").strip().lower()
    if post_type not in ALLOWED_POST_TYPES:
        raise ValueError("type must be one of: video, article, post, resource")
    return post_type


def _require_post_exists(sb, tenant_id: int, post_id: int) -> dict[str, Any] | None:
    row = (
        sb.table("tenant_feed_posts")
        .select("id, tenant_id, author_user_id, is_published")
        .eq("id", post_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return (row.data or None) if row else None


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sanitize_filename(filename: str) -> str:
    safe = Path(filename or "").name.strip().replace(" ", "_")
    if not safe:
        safe = f"upload_{uuid4().hex[:8]}"
    return safe[:120]


def _build_storage_path(tenant_id: int, filename: str) -> str:
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    suffix = uuid4().hex[:10]
    safe_filename = _sanitize_filename(filename)
    return f"tenant_{tenant_id}/posts/{ts}_{suffix}_{safe_filename}"


def _resolve_public_url(bucket_api: Any, path: str) -> str | None:
    try:
        response = bucket_api.get_public_url(path)
    except Exception:
        return None

    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        return response.get("publicUrl") or response.get("public_url")
    return None


def _resolve_signed_upload(bucket_api: Any, path: str) -> dict[str, Any]:
    signer = getattr(bucket_api, "create_signed_upload_url", None)
    if callable(signer):
        return signer(path)

    raise RuntimeError(
        "Signed upload URLs are not supported by current Supabase SDK. "
        "Upgrade backend dependency or upload media by URL for now."
    )


@bp.route("/content-feed/posts", methods=["GET"])
@require_auth
def list_feed_posts():
    sb = get_supabase_admin()
    include_unpublished = _to_bool(
        request.args.get("include_unpublished"), default=False
    )
    is_owner_view = g.role in {"owner", "super_admin"}

    query = (
        sb.table("tenant_feed_posts")
        .select(
            "id,tenant_id,author_user_id,type,title,body,media_url,media_path,"
            "media_mime,is_published,created_at,updated_at"
        )
        .eq("tenant_id", g.tenant_id)
        .order("created_at", desc=True)
        .limit(50)
    )
    if not (include_unpublished and is_owner_view):
        query = query.eq("is_published", True)

    rows = _result_data(query.execute())
    if not rows:
        return jsonify({"posts": []})

    post_ids = [int(r["id"]) for r in rows]
    author_ids = list({int(r["author_user_id"]) for r in rows if r.get("author_user_id")})

    likes_rows = _result_data(
        sb.table("tenant_feed_likes")
        .select("post_id,user_id")
        .eq("tenant_id", g.tenant_id)
        .in_("post_id", post_ids)
        .execute()
    )
    comments_rows = _result_data(
        sb.table("tenant_feed_comments")
        .select("id,post_id")
        .eq("tenant_id", g.tenant_id)
        .eq("is_deleted", False)
        .in_("post_id", post_ids)
        .execute()
    )
    users_rows: list[dict[str, Any]] = []
    if author_ids:
        users_rows = _result_data(
            sb.table("users")
            .select("id,email")
            .eq("tenant_id", g.tenant_id)
            .in_("id", author_ids)
            .execute()
        )
    author_email_by_id = {int(u["id"]): u.get("email") for u in users_rows if u.get("id")}

    like_count_by_post: dict[int, int] = {}
    liked_post_ids: set[int] = set()
    for row in likes_rows:
        pid = int(row.get("post_id", 0))
        if pid <= 0:
            continue
        like_count_by_post[pid] = like_count_by_post.get(pid, 0) + 1
        if int(row.get("user_id", 0)) == int(g.user_id):
            liked_post_ids.add(pid)

    comment_count_by_post: dict[int, int] = {}
    for row in comments_rows:
        pid = int(row.get("post_id", 0))
        if pid <= 0:
            continue
        comment_count_by_post[pid] = comment_count_by_post.get(pid, 0) + 1

    posts = []
    for row in rows:
        pid = int(row["id"])
        author_id = int(row["author_user_id"])
        posts.append(
            {
                **row,
                "author_email": author_email_by_id.get(author_id),
                "like_count": like_count_by_post.get(pid, 0),
                "comment_count": comment_count_by_post.get(pid, 0),
                "viewer_has_liked": pid in liked_post_ids,
            }
        )

    return jsonify({"posts": posts})


@bp.route("/content-feed/posts", methods=["POST"])
@require_auth
@require_role("owner")
def create_feed_post():
    body = request.get_json(silent=True) or {}
    try:
        post_type = _validate_post_type(body.get("type"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    title = (body.get("title") or "").strip() or None
    post_body = (body.get("body") or "").strip() or None
    media_url = (body.get("media_url") or "").strip() or None
    media_path = (body.get("media_path") or "").strip() or None
    media_mime = (body.get("media_mime") or "").strip() or None
    is_published = bool(body.get("is_published", True))

    if not any([title, post_body, media_url]):
        return jsonify({"error": "At least one of title, body, or media_url is required"}), 400

    row = {
        "tenant_id": g.tenant_id,
        "author_user_id": g.user_id,
        "type": post_type,
        "title": title,
        "body": post_body,
        "media_url": media_url,
        "media_path": media_path,
        "media_mime": media_mime,
        "is_published": is_published,
    }

    sb = get_supabase_admin()
    result = sb.table("tenant_feed_posts").insert(row).execute()
    data = _result_data(result)
    if not data:
        return jsonify({"error": "Unable to create post"}), 500
    return jsonify({"post": data[0]}), 201


@bp.route("/content-feed/posts/<int:post_id>", methods=["PUT"])
@require_auth
@require_role("owner")
def update_feed_post(post_id: int):
    body = request.get_json(silent=True) or {}
    updates: dict[str, Any] = {"updated_at": _utc_now_iso()}

    if "type" in body:
        try:
            updates["type"] = _validate_post_type(body.get("type"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    for field in ("title", "body", "media_url", "media_path", "media_mime"):
        if field in body:
            value = body.get(field)
            updates[field] = value.strip() if isinstance(value, str) else value
    if "is_published" in body:
        updates["is_published"] = bool(body.get("is_published"))

    if len(updates) == 1:
        return jsonify({"error": "No updatable fields provided"}), 400

    sb = get_supabase_admin()
    result = (
        sb.table("tenant_feed_posts")
        .update(updates)
        .eq("id", post_id)
        .eq("tenant_id", g.tenant_id)
        .execute()
    )
    data = _result_data(result)
    if not data:
        return jsonify({"error": "Post not found"}), 404
    return jsonify({"post": data[0]})


@bp.route("/content-feed/posts/<int:post_id>", methods=["DELETE"])
@require_auth
@require_role("owner")
def delete_feed_post(post_id: int):
    sb = get_supabase_admin()
    result = (
        sb.table("tenant_feed_posts")
        .delete()
        .eq("id", post_id)
        .eq("tenant_id", g.tenant_id)
        .execute()
    )
    data = _result_data(result)
    if not data:
        return jsonify({"error": "Post not found"}), 404
    return jsonify({"message": "Deleted"}), 200


@bp.route("/content-feed/posts/<int:post_id>/likes", methods=["POST"])
@require_auth
def like_feed_post(post_id: int):
    sb = get_supabase_admin()
    post = _require_post_exists(sb, g.tenant_id, post_id)
    if not post:
        return jsonify({"error": "Post not found"}), 404

    row = {"tenant_id": g.tenant_id, "post_id": post_id, "user_id": g.user_id}
    try:
        result = sb.table("tenant_feed_likes").insert(row).execute()
    except Exception as exc:
        text = str(exc).lower()
        if "duplicate key" in text or "tenant_feed_likes_post_user_key" in text:
            return jsonify({"message": "Already liked"}), 200
        raise

    data = _result_data(result)
    return jsonify({"like": data[0] if data else row}), 201


@bp.route("/content-feed/posts/<int:post_id>/likes/me", methods=["DELETE"])
@require_auth
def unlike_feed_post(post_id: int):
    sb = get_supabase_admin()
    result = (
        sb.table("tenant_feed_likes")
        .delete()
        .eq("tenant_id", g.tenant_id)
        .eq("post_id", post_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    _ = _result_data(result)
    return jsonify({"message": "Removed"}), 200


@bp.route("/content-feed/posts/<int:post_id>/comments", methods=["GET"])
@require_auth
def list_feed_comments(post_id: int):
    sb = get_supabase_admin()
    post = _require_post_exists(sb, g.tenant_id, post_id)
    if not post:
        return jsonify({"error": "Post not found"}), 404

    rows = _result_data(
        sb.table("tenant_feed_comments")
        .select("id,tenant_id,post_id,user_id,body,is_deleted,created_at,updated_at")
        .eq("tenant_id", g.tenant_id)
        .eq("post_id", post_id)
        .eq("is_deleted", False)
        .order("created_at")
        .execute()
    )

    user_ids = list({int(r["user_id"]) for r in rows if r.get("user_id")})
    users_rows: list[dict[str, Any]] = []
    if user_ids:
        users_rows = _result_data(
            sb.table("users")
            .select("id,email")
            .eq("tenant_id", g.tenant_id)
            .in_("id", user_ids)
            .execute()
        )
    email_by_id = {int(r["id"]): r.get("email") for r in users_rows if r.get("id")}

    comments = [
        {
            **row,
            "user_email": email_by_id.get(int(row["user_id"]), None),
        }
        for row in rows
    ]
    return jsonify({"comments": comments})


@bp.route("/content-feed/posts/<int:post_id>/comments", methods=["POST"])
@require_auth
def create_feed_comment(post_id: int):
    body = request.get_json(silent=True) or {}
    text = (body.get("body") or "").strip()
    if not text:
        return jsonify({"error": "body is required"}), 400
    if len(text) > 1000:
        return jsonify({"error": "Comment is too long (max 1000 chars)"}), 400

    sb = get_supabase_admin()
    post = _require_post_exists(sb, g.tenant_id, post_id)
    if not post:
        return jsonify({"error": "Post not found"}), 404

    row = {
        "tenant_id": g.tenant_id,
        "post_id": post_id,
        "user_id": g.user_id,
        "body": text,
        "is_deleted": False,
    }
    result = sb.table("tenant_feed_comments").insert(row).execute()
    data = _result_data(result)
    if not data:
        return jsonify({"error": "Unable to create comment"}), 500
    return jsonify({"comment": data[0]}), 201


@bp.route("/content-feed/comments/<int:comment_id>", methods=["DELETE"])
@require_auth
def delete_feed_comment(comment_id: int):
    sb = get_supabase_admin()
    comment = (
        sb.table("tenant_feed_comments")
        .select("id,user_id")
        .eq("id", comment_id)
        .eq("tenant_id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    data = comment.data or None
    if not data:
        return jsonify({"error": "Comment not found"}), 404

    can_delete = int(data.get("user_id")) == int(g.user_id) or g.role in {
        "owner",
        "super_admin",
    }
    if not can_delete:
        return jsonify({"error": "Forbidden"}), 403

    try:
        sb.table("tenant_feed_comments").update(
            {"is_deleted": True, "updated_at": _utc_now_iso()}
        ).eq("id", comment_id).eq("tenant_id", g.tenant_id).execute()
    except Exception as exc:
        if not _is_postgrest_missing_response(exc):
            raise
    return jsonify({"message": "Deleted"}), 200


@bp.route("/content-feed/upload-sign-url", methods=["POST"])
@require_auth
@require_role("owner")
def create_feed_upload_signature():
    body = request.get_json(silent=True) or {}
    filename = body.get("filename", "")
    if not filename:
        return jsonify({"error": "filename is required"}), 400

    bucket_name = (
        os.environ.get("SUPABASE_CONTENT_BUCKET", "").strip() or DEFAULT_BUCKET
    )
    object_path = _build_storage_path(g.tenant_id, filename)
    sb = get_supabase_admin()

    try:
        bucket_api = sb.storage.from_(bucket_name)
        signed_payload = _resolve_signed_upload(bucket_api, object_path)
        public_url = _resolve_public_url(bucket_api, object_path)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        current_app.logger.exception("Unable to create signed upload URL")
        return jsonify({"error": f"Unable to create upload URL: {exc}"}), 502

    signed_url = None
    token = None
    if isinstance(signed_payload, dict):
        signed_url = (
            signed_payload.get("signed_url")
            or signed_payload.get("signedUrl")
            or signed_payload.get("url")
        )
        token = signed_payload.get("token")
    elif isinstance(signed_payload, str):
        signed_url = signed_payload

    if signed_url and signed_url.startswith("/"):
        base = current_app.config.get("SUPABASE_URL", "").rstrip("/")
        signed_url = f"{base}/storage/v1{signed_url}"

    return jsonify(
        {
            "bucket": bucket_name,
            "object_path": object_path,
            "signed_upload_url": signed_url,
            "token": token,
            "public_url": public_url,
        }
    )
