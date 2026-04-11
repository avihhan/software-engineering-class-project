import os
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, g, jsonify, request
from app.auth import get_supabase_admin, require_auth, require_role
from app.registration_code import (
    ensure_tenant_registration_code,
    reset_tenant_registration_code,
)
from app.services.billing_service import get_tenant_billing_config
from app.services.lemon_squeezy_service import list_test_mode_assets

bp = Blueprint("admin", __name__)
DEFAULT_LOGO_BUCKET = "tenant-branding"


def _is_postgrest_missing_response(exc: Exception) -> bool:
    text = str(exc).lower()
    return "missing response" in text and (
        "'code': '204'" in text or '"code": "204"' in text
    )


def _is_missing_billing_table(exc: Exception) -> bool:
    text = str(exc).lower()
    return "pgrst205" in text and "tenant_billing_configs" in text


def _is_postgrest_missing_response(exc: Exception) -> bool:
    text = str(exc).lower()
    return "missing response" in text and "'code': '204'" in text


def _can_use_branding_fallback(exc: Exception) -> bool:
    return _is_postgrest_missing_response(exc)


def _is_missing_branding_columns(exc: Exception) -> bool:
    text = str(exc).lower()
    return "pgrst204" in text and (
        "background_color" in text or "widget_background_color" in text
    )


def _sanitize_filename(filename: str) -> str:
    safe = Path(filename or "").name.strip().replace(" ", "_")
    if not safe:
        safe = f"logo_{uuid4().hex[:8]}"
    return safe[:120]


def _build_logo_storage_path(tenant_id: int, filename: str) -> str:
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    suffix = uuid4().hex[:10]
    return f"tenant_{tenant_id}/branding/logo/{ts}_{suffix}_{_sanitize_filename(filename)}"


def _resolve_public_url(bucket_api, path: str) -> str | None:
    try:
        response = bucket_api.get_public_url(path)
    except Exception:
        return None

    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        return response.get("publicUrl") or response.get("public_url")
    return None


def _resolve_signed_upload(bucket_api, path: str):
    signer = getattr(bucket_api, "create_signed_upload_url", None)
    if callable(signer):
        return signer(path)
    raise RuntimeError(
        "Signed upload URLs are not supported by current Supabase SDK. "
        "Upgrade backend dependency to enable logo uploads."
    )


def _resolve_week_window(body: dict) -> tuple[date, date]:
    """Resolve a reporting window (inclusive), defaulting to last 7 days."""
    today = date.today()
    default_start = today - timedelta(days=6)

    start_raw = (body.get("start_date") or "").strip()
    end_raw = (body.get("end_date") or "").strip()

    try:
        start_date = date.fromisoformat(start_raw) if start_raw else default_start
        end_date = date.fromisoformat(end_raw) if end_raw else today
    except ValueError:
        start_date = default_start
        end_date = today

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    return start_date, end_date


def _status_value(raw: str | None) -> str:
    return (raw or "").strip().lower()


def _to_num(raw) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _delta(first_val: float | None, last_val: float | None) -> float | None:
    if first_val is None or last_val is None:
        return None
    return round(last_val - first_val, 1)


def _build_member_weekly_summary(sb, tenant_id: int, member_id: int, start_date: date, end_date: date):
    start_iso = start_date.isoformat()
    end_iso = end_date.isoformat()
    start_dt_iso = datetime.combine(start_date, time.min).isoformat()
    end_dt_iso = datetime.combine(end_date, time.max).isoformat()

    weekly_workouts = (
        sb.table("workout_logs")
        .select("id, workout_date")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .gte("workout_date", start_iso)
        .lte("workout_date", end_iso)
        .execute()
    )
    all_workouts = (
        sb.table("workout_logs")
        .select("workout_date")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .execute()
    )
    workout_rows = weekly_workouts.data or []
    all_workout_dates = [w.get("workout_date") for w in (all_workouts.data or []) if w.get("workout_date")]
    from app.services.streak_service import calculate_streak
    streak_stats = calculate_streak(all_workout_dates)

    nutrition_rows_result = (
        sb.table("nutrition_logs")
        .select("calories, protein, logged_at")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .gte("logged_at", start_dt_iso)
        .lte("logged_at", end_dt_iso)
        .execute()
    )
    nutrition_rows = nutrition_rows_result.data or []
    cal_values = [_to_num(n.get("calories")) for n in nutrition_rows]
    protein_values = [_to_num(n.get("protein")) for n in nutrition_rows]
    cal_values = [v for v in cal_values if v is not None]
    protein_values = [v for v in protein_values if v is not None]

    body_weekly_result = (
        sb.table("body_metrics")
        .select("weight, body_fat_percentage, recorded_at")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .gte("recorded_at", start_dt_iso)
        .lte("recorded_at", end_dt_iso)
        .order("recorded_at", desc=False)
        .execute()
    )
    body_latest_result = (
        sb.table("body_metrics")
        .select("weight, body_fat_percentage, recorded_at")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    body_weekly_rows = body_weekly_result.data or []
    body_latest = (body_latest_result.data or [None])[0]

    first_week = body_weekly_rows[0] if body_weekly_rows else None
    last_week = body_weekly_rows[-1] if body_weekly_rows else None

    first_weight = _to_num((first_week or {}).get("weight"))
    last_weight = _to_num((last_week or {}).get("weight"))
    first_body_fat = _to_num((first_week or {}).get("body_fat_percentage"))
    last_body_fat = _to_num((last_week or {}).get("body_fat_percentage"))

    goals_result = (
        sb.table("goals")
        .select("status, goal_type, start_date")
        .eq("tenant_id", tenant_id)
        .eq("user_id", member_id)
        .execute()
    )
    goals_rows = goals_result.data or []
    completed_statuses = {"completed", "done", "achieved"}
    completed_count = sum(1 for g in goals_rows if _status_value(g.get("status")) in completed_statuses)
    open_count = max(len(goals_rows) - completed_count, 0)
    started_this_week = 0
    for g in goals_rows:
        start_raw = g.get("start_date")
        if not start_raw:
            continue
        try:
            d = date.fromisoformat(str(start_raw).split("T")[0])
        except ValueError:
            continue
        if start_date <= d <= end_date:
            started_this_week += 1

    return {
        "window": {
            "start_date": start_iso,
            "end_date": end_iso,
        },
        "workouts": {
            "weekly_sessions": len(workout_rows),
            "weekly_active_days": len({w.get("workout_date") for w in workout_rows if w.get("workout_date")}),
            "current_streak_days": streak_stats["current_streak"],
            "lifetime_workout_days": streak_stats["total_workouts"],
        },
        "nutrition": {
            "meal_logs": len(nutrition_rows),
            "avg_calories": _avg(cal_values),
            "avg_protein_g": _avg(protein_values),
        },
        "body_metrics": {
            "latest_weight_lbs": _to_num((body_latest or {}).get("weight")),
            "latest_body_fat_pct": _to_num((body_latest or {}).get("body_fat_percentage")),
            "weight_change_weekly_lbs": _delta(first_weight, last_weight),
            "body_fat_change_weekly_pct": _delta(first_body_fat, last_body_fat),
        },
        "goals": {
            "total_goals": len(goals_rows),
            "open_goals": open_count,
            "completed_goals": completed_count,
            "started_this_week": started_this_week,
        },
    }


@bp.route("/analytics", methods=["GET"])
@require_auth
@require_role("owner")
def tenant_analytics():
    """Aggregate stats for the current tenant (owner + super_admin)."""
    from app.auth import is_platform_admin

    tid = request.args.get("tenant_id", type=int) if is_platform_admin() else None
    tenant_id = tid or g.tenant_id

    sb = get_supabase_admin()

    members = (
        sb.table("users")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("role", "member")
        .execute()
    )
    workouts = (
        sb.table("workout_logs")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .execute()
    )
    subs = (
        sb.table("subscriptions")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .execute()
    )

    return jsonify(
        {
            "tenant_id": tenant_id,
            "total_members": members.count or 0,
            "total_workouts": workouts.count or 0,
            "active_subscriptions": subs.count or 0,
        }
    )


@bp.route("/members", methods=["GET"])
@require_auth
@require_role("owner")
def list_members():
    """List all members in the current tenant."""
    sb = get_supabase_admin()
    result = (
        sb.table("users")
        .select("id, email, role, is_email_verified, created_at")
        .eq("tenant_id", g.tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    return jsonify({"members": result.data or []})


@bp.route("/members/<int:member_id>/verify", methods=["POST"])
@require_auth
@require_role("owner")
def verify_member(member_id):
    """Mark a tenant member as email-verified."""
    sb = get_supabase_admin()

    current = (
        sb.table("users")
        .select("id, email, role, is_email_verified, created_at")
        .eq("id", member_id)
        .eq("tenant_id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    if not current or not current.data:
        return jsonify({"error": "Member not found"}), 404
    if current.data.get("role") != "member":
        return jsonify({"error": "Only members can be verified"}), 400

    if current.data.get("is_email_verified"):
        return jsonify({"member": current.data})

    updated = (
        sb.table("users")
        .update({"is_email_verified": True})
        .eq("id", member_id)
        .eq("tenant_id", g.tenant_id)
        .select("id, email, role, is_email_verified, created_at")
        .maybe_single()
        .execute()
    )
    if not updated or not updated.data:
        return jsonify({"error": "Unable to verify member"}), 500

    return jsonify({"member": updated.data})


@bp.route("/branding", methods=["GET"])
@require_auth
@require_role("owner")
def get_branding():
    sb = get_supabase_admin()
    try:
        result = (
            sb.table("tenants")
            .select(
                "id, name, logo_url, primary_color, secondary_color, background_color, widget_background_color, custom_domain, registration_code"
            )
            .eq("id", g.tenant_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        # Fallbacks:
        # - occasional postgrest-py "Missing response" bug (code 204)
        if _can_use_branding_fallback(exc) or _is_missing_branding_columns(exc):
            try:
                result = (
                    sb.table("tenants")
                    .select(
                        "id, name, logo_url, primary_color, secondary_color, background_color, widget_background_color, custom_domain"
                    )
                    .eq("id", g.tenant_id)
                    .maybe_single()
                    .execute()
                )
                if result.data:
                    result.data["registration_code"] = None
                    return jsonify({"branding": result.data})
            except Exception:
                pass
            # Last-resort response so settings UI does not hard-fail.
            return jsonify(
                {
                    "branding": {
                        "id": g.tenant_id,
                        "name": "Organization",
                        "logo_url": None,
                        "primary_color": None,
                        "secondary_color": None,
                        "background_color": None,
                        "widget_background_color": None,
                        "custom_domain": None,
                        "registration_code": None,
                    }
                }
            )
        raise
    if result.data:
        result.data["registration_code"] = ensure_tenant_registration_code(
            sb, g.tenant_id, result.data.get("registration_code")
        )
    return jsonify({"branding": result.data})


@bp.route("/branding", methods=["PUT"])
@require_auth
@require_role("owner")
def update_branding():
    body = request.get_json(silent=True) or {}
    allowed = {}
    for field in (
        "name",
        "logo_url",
        "primary_color",
        "secondary_color",
        "background_color",
        "widget_background_color",
        "custom_domain",
    ):
        if field in body:
            allowed[field] = body[field]
    if not allowed:
        return jsonify({"error": "No updatable fields provided"}), 400

    sb = get_supabase_admin()
    try:
        result = (
            sb.table("tenants")
            .update(allowed)
            .eq("id", g.tenant_id)
            .execute()
        )
    except Exception as exc:
        if not _is_missing_branding_columns(exc):
            raise
        allowed.pop("background_color", None)
        allowed.pop("widget_background_color", None)
        if not allowed:
            return jsonify({"error": "No compatible updatable fields provided"}), 400
        result = (
            sb.table("tenants")
            .update(allowed)
            .eq("id", g.tenant_id)
            .execute()
        )
    if not result.data:
        return jsonify({"error": "Update failed"}), 500
    tenant = result.data[0]
    current_code = tenant.get("registration_code")
    if current_code is None:
        try:
            code_row = (
                sb.table("tenants")
                .select("registration_code")
                .eq("id", g.tenant_id)
                .maybe_single()
                .execute()
            )
            current_code = (
                code_row.data.get("registration_code") if code_row and code_row.data else None
            )
        except Exception as exc:
            if _is_postgrest_missing_response(exc):
                current_code = None
            else:
                raise
    tenant["registration_code"] = ensure_tenant_registration_code(
        sb, g.tenant_id, current_code
    )
    return jsonify({"branding": tenant})


@bp.route("/branding/logo-upload-sign-url", methods=["POST"])
@require_auth
@require_role("owner")
def create_branding_logo_upload_signature():
    body = request.get_json(silent=True) or {}
    filename = (body.get("filename") or "").strip()
    if not filename:
        return jsonify({"error": "filename is required"}), 400

    bucket_name = os.environ.get("SUPABASE_LOGO_BUCKET", "").strip() or DEFAULT_LOGO_BUCKET
    object_path = _build_logo_storage_path(g.tenant_id, filename)
    sb = get_supabase_admin()
    try:
        bucket_api = sb.storage.from_(bucket_name)
        signed_payload = _resolve_signed_upload(bucket_api, object_path)
        public_url = _resolve_public_url(bucket_api, object_path)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        current_app.logger.exception("Unable to create branding logo upload URL")
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


@bp.route("/registration-code/reset", methods=["POST"])
@require_auth
@require_role("owner")
def reset_registration_code():
    sb = get_supabase_admin()
    try:
        new_code = reset_tenant_registration_code(sb, g.tenant_id)
    except Exception:
        current_app.logger.exception("Failed to reset tenant registration code")
        return (
            jsonify(
                {
                    "error": "Unable to reset registration code. Ensure migration 003 is applied and try again."
                }
            ),
            500,
        )
    return jsonify({"registration_code": new_code})


@bp.route("/billing", methods=["GET"])
@require_auth
@require_role("owner")
def get_billing_settings():
    sb = get_supabase_admin()
    try:
        return jsonify({"billing": get_tenant_billing_config(sb, g.tenant_id)})
    except Exception:
        current_app.logger.exception("Failed to fetch tenant billing settings")
        # Return safe defaults so Settings page still works even if billing tables are missing.
        return jsonify(
            {
                "billing": {
                    "tenant_id": g.tenant_id,
                    "provider": "lemon_squeezy",
                    "enabled": False,
                    "trial_days": 7,
                    "store_id": None,
                    "product_id": None,
                    "variant_id": None,
                    "plan_name": None,
                    "plan_description": None,
                    "offer_description": None,
                    "price_cents": 0,
                    "currency": "USD",
                    "discount_type": "none",
                    "discount_value": None,
                },
                "warning": "Billing config unavailable. Ensure migration 004 is applied.",
            }
        )


@bp.route("/billing/test-assets", methods=["GET"])
@require_auth
@require_role("owner")
def get_billing_test_assets():
    """List Lemon test-mode stores/variants for fast tenant setup."""
    import os

    api_key = (
        os.environ.get("LEMON_SQUEEZY_API_KEY", "").strip()
        or os.environ.get("LEMONSQUEEZY_API_KEY", "").strip()
    )
    if not api_key:
        return (
            jsonify(
                {
                    "error": "Missing Lemon API key. Set LEMON_SQUEEZY_API_KEY (or legacy LEMONSQUEEZY_API_KEY)."
                }
            ),
            500,
        )

    try:
        assets = list_test_mode_assets(api_key)
        return jsonify(assets)
    except RuntimeError as exc:
        current_app.logger.exception("Failed to fetch Lemon test mode assets")
        return jsonify({"error": str(exc)}), 502


@bp.route("/billing", methods=["PUT"])
@require_auth
@require_role("owner")
def update_billing_settings():
    body = request.get_json(silent=True) or {}
    enabled = bool(body.get("enabled", False))
    provider = (body.get("provider") or "lemon_squeezy").strip()
    discount_type = (body.get("discount_type") or "none").strip()

    if provider != "lemon_squeezy":
        return jsonify({"error": "Only lemon_squeezy is supported right now"}), 400
    if discount_type not in {"none", "percent", "amount"}:
        return jsonify({"error": "discount_type must be none, percent, or amount"}), 400

    try:
        trial_days = int(body.get("trial_days", 7) or 7)
    except (TypeError, ValueError):
        return jsonify({"error": "trial_days must be an integer"}), 400
    if trial_days < 0:
        return jsonify({"error": "trial_days must be >= 0"}), 400

    price_cents = body.get("price_cents")
    if price_cents is not None:
        try:
            price_cents = int(price_cents)
        except (TypeError, ValueError):
            return jsonify({"error": "price_cents must be an integer"}), 400
        if price_cents < 0:
            return jsonify({"error": "price_cents must be >= 0"}), 400

    discount_value = body.get("discount_value")
    if discount_type == "percent" and discount_value is not None:
        try:
            discount_value = float(discount_value)
        except (TypeError, ValueError):
            return jsonify({"error": "discount_value must be numeric"}), 400
        if discount_value < 0 or discount_value > 100:
            return jsonify({"error": "discount_value for percent must be in [0, 100]"}), 400
    elif discount_type == "amount" and discount_value is not None:
        try:
            discount_value = float(discount_value)
        except (TypeError, ValueError):
            return jsonify({"error": "discount_value must be numeric"}), 400
        if discount_value < 0:
            return jsonify({"error": "discount_value must be >= 0"}), 400
    elif discount_type == "none":
        discount_value = None

    if enabled:
        required_fields = ("store_id", "variant_id", "plan_name", "price_cents")
        missing = [f for f in required_fields if body.get(f) in (None, "")]
        if missing:
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    payload = {
        "tenant_id": g.tenant_id,
        "provider": provider,
        "enabled": enabled,
        "trial_days": trial_days,
        "store_id": (body.get("store_id") or None),
        "product_id": (body.get("product_id") or None),
        "variant_id": (body.get("variant_id") or None),
        "plan_name": (body.get("plan_name") or None),
        "plan_description": (body.get("plan_description") or None),
        "offer_description": (body.get("offer_description") or None),
        "price_cents": price_cents,
        "currency": (body.get("currency") or "USD").upper(),
        "discount_type": discount_type,
        "discount_value": discount_value,
    }

    sb = get_supabase_admin()
    try:
        existing = (
            sb.table("tenant_billing_configs")
            .select("id")
            .eq("tenant_id", g.tenant_id)
            .limit(1)
            .execute()
        )
        has_existing = bool(existing.data and len(existing.data) > 0)
        if has_existing:
            try:
                sb.table("tenant_billing_configs").update(payload).eq(
                    "tenant_id", g.tenant_id
                ).execute()
            except Exception as exc:
                if not _is_postgrest_missing_response(exc):
                    raise
        else:
            try:
                sb.table("tenant_billing_configs").insert(payload).execute()
            except Exception as exc:
                if not _is_postgrest_missing_response(exc):
                    raise

        return jsonify({"billing": get_tenant_billing_config(sb, g.tenant_id)})
    except Exception as exc:
        current_app.logger.exception("Failed to update tenant billing settings")
        if _is_missing_billing_table(exc):
            return (
                jsonify(
                    {
                        "error": (
                            "Billing tables are missing in Supabase. "
                            "Run server/migrations/004_tenant_billing.sql in the same project as SUPABASE_URL."
                        )
                    }
                ),
                500,
            )
        return (
            jsonify({"error": "Unable to save billing settings. Ensure migration 004 is applied."}),
            500,
        )


@bp.route("/members/<int:member_id>/report", methods=["GET"])
@require_auth
@require_role("owner")
def member_report(member_id):
    """Return a JSON summary for building a PDF client progress report."""
    sb = get_supabase_admin()

    user = (
        sb.table("users")
        .select("id, email, created_at")
        .eq("id", member_id)
        .eq("tenant_id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    if not user or not user.data:
        return jsonify({"error": "Member not found"}), 404

    metrics = (
        sb.table("body_metrics")
        .select("weight, body_fat_percentage, recorded_at")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .order("recorded_at", desc=True)
        .limit(30)
        .execute()
    )
    workouts = (
        sb.table("workout_logs")
        .select("id, workout_date, notes")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .order("workout_date", desc=True)
        .limit(30)
        .execute()
    )
    nutrition = (
        sb.table("nutrition_logs")
        .select("calories, protein, carbs, fats, logged_at")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .order("logged_at", desc=True)
        .limit(30)
        .execute()
    )
    goals = (
        sb.table("goals")
        .select("goal_type, target_value, status")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .execute()
    )

    return jsonify({
        "member": user.data,
        "metrics": metrics.data or [],
        "workouts": workouts.data or [],
        "nutrition": nutrition.data or [],
        "goals": goals.data or [],
    })


@bp.route("/weekly-summary", methods=["POST"])
@require_auth
@require_role("owner")
def send_weekly_summaries():
    """Send tenant-scoped weekly summary emails to all members."""
    from app.services.email_service import send_weekly_summary

    body = request.get_json(silent=True) or {}
    start_date, end_date = _resolve_week_window(body)

    sb = get_supabase_admin()
    members = (
        sb.table("users")
        .select("id, email")
        .eq("tenant_id", g.tenant_id)
        .eq("role", "member")
        .execute()
    )

    tenant = (
        sb.table("tenants")
        .select("name, logo_url, primary_color, secondary_color")
        .eq("id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    tenant_data = tenant.data or {}
    tenant_name = tenant_data.get("name") or "AuraFit"

    sent_count = 0
    skipped_count = 0
    failed_count = 0
    errors: list[dict] = []
    provider_counts: dict[str, int] = {}
    members_list = members.data or []

    for m in members_list:
        member_email = (m.get("email") or "").strip()
        if not member_email:
            skipped_count += 1
            continue
        member_id = m.get("id")
        if member_id is None:
            skipped_count += 1
            continue
        try:
            summary = _build_member_weekly_summary(
                sb=sb,
                tenant_id=g.tenant_id,
                member_id=member_id,
                start_date=start_date,
                end_date=end_date,
            )
            result = send_weekly_summary(
                to=member_email,
                user_name=member_email.split("@")[0],
                tenant_name=tenant_name,
                week_start=start_date.isoformat(),
                week_end=end_date.isoformat(),
                summary=summary,
                branding={
                    "logo_url": tenant_data.get("logo_url"),
                    "primary_color": tenant_data.get("primary_color"),
                    "secondary_color": tenant_data.get("secondary_color"),
                },
            )
            provider = (result.get("provider") or "unknown").strip() or "unknown"
            provider_counts[provider] = provider_counts.get(provider, 0) + 1
            if result.get("sent"):
                sent_count += 1
            else:
                failed_count += 1
                current_app.logger.warning(
                    "Weekly summary send failed tenant=%s email=%s provider=%s detail=%s",
                    g.tenant_id,
                    member_email,
                    provider,
                    result.get("detail"),
                )
                errors.append(
                    {
                        "email": member_email,
                        "provider": provider,
                        "error": result.get("detail") or "send failed",
                    }
                )
        except Exception as exc:
            failed_count += 1
            current_app.logger.exception(
                "Weekly summary send crashed tenant=%s email=%s",
                g.tenant_id,
                member_email,
            )
            errors.append({"email": member_email, "error": str(exc)})

    return jsonify(
        {
            "window": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            "sent": sent_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "total_members": len(members_list),
            "providers": provider_counts,
            "errors": errors[:10],
        }
    )


@bp.route("/members/<int:member_id>", methods=["GET"])
@require_auth
@require_role("owner")
def get_member(member_id):
    """Get a specific member's profile and recent metrics."""
    sb = get_supabase_admin()

    user = (
        sb.table("users")
        .select("id, email, role, is_email_verified, created_at")
        .eq("id", member_id)
        .eq("tenant_id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    if not user or not user.data:
        return jsonify({"error": "Member not found"}), 404

    metrics = (
        sb.table("body_metrics")
        .select("*")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .order("recorded_at", desc=True)
        .limit(10)
        .execute()
    )

    workouts = (
        sb.table("workout_logs")
        .select("id, workout_date, notes, created_at")
        .eq("user_id", member_id)
        .eq("tenant_id", g.tenant_id)
        .order("workout_date", desc=True)
        .limit(10)
        .execute()
    )

    return jsonify(
        {
            "member": user.data,
            "recent_metrics": metrics.data or [],
            "recent_workouts": workouts.data or [],
        }
    )
