from flask import Blueprint, g, jsonify, request
from app.auth import get_supabase_admin, require_auth

bp = Blueprint("favorites", __name__)
ALLOWED_FAVORITE_TYPES = {"workout", "nutrition"}


@bp.route("/favorites", methods=["GET"])
@require_auth
def list_favorites():
    sb = get_supabase_admin()
    result = (
        sb.table("favorites")
        .select("*, exercises(id, name, muscle_group, equipment)")
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return jsonify({"favorites": result.data or []})


@bp.route("/favorites", methods=["POST"])
@require_auth
def add_favorite():
    body = request.get_json(silent=True) or {}
    exercise_id = body.get("exercise_id")
    if not exercise_id:
        return jsonify({"error": "exercise_id is required"}), 400

    sb = get_supabase_admin()
    result = (
        sb.table("favorites")
        .insert(
            {
                "tenant_id": g.tenant_id,
                "user_id": g.user_id,
                "exercise_id": exercise_id,
            }
        )
        .execute()
    )
    if not result.data:
        return jsonify({"error": "Insert failed"}), 500
    return jsonify({"favorite": result.data[0]}), 201


@bp.route("/favorites/<int:exercise_id>", methods=["DELETE"])
@require_auth
def remove_favorite(exercise_id):
    sb = get_supabase_admin()
    result = (
        sb.table("favorites")
        .delete()
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .eq("exercise_id", exercise_id)
        .execute()
    )
    if not result.data:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"message": "Removed"}), 200


def _result_data(result):
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


def _load_member_favorite_snapshots(sb):
    favorite_rows = _result_data(
        sb.table("member_favorite_items")
        .select("id, item_type, item_id, created_at")
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .order("created_at", desc=True)
        .execute()
    )
    workout_ids = [int(r["item_id"]) for r in favorite_rows if r.get("item_type") == "workout"]
    nutrition_ids = [int(r["item_id"]) for r in favorite_rows if r.get("item_type") == "nutrition"]

    workouts = []
    if workout_ids:
        workouts = _result_data(
            sb.table("workout_logs")
            .select("id, workout_date, notes, created_at")
            .eq("tenant_id", g.tenant_id)
            .eq("user_id", g.user_id)
            .in_("id", workout_ids)
            .execute()
        )
    nutrition_logs = []
    if nutrition_ids:
        nutrition_logs = _result_data(
            sb.table("nutrition_logs")
            .select("id, meal_type, meal_items, calories, protein, carbs, fats, logged_at")
            .eq("tenant_id", g.tenant_id)
            .eq("user_id", g.user_id)
            .in_("id", nutrition_ids)
            .execute()
        )
    workout_by_id = {int(w["id"]): w for w in workouts if w.get("id") is not None}
    nutrition_by_id = {
        int(n["id"]): n for n in nutrition_logs if n.get("id") is not None
    }

    items = []
    for row in favorite_rows:
        item_type = row.get("item_type")
        item_id = int(row.get("item_id", 0))
        if item_type == "workout":
            entity = workout_by_id.get(item_id)
        else:
            entity = nutrition_by_id.get(item_id)
        if not entity:
            continue
        items.append(
            {
                "id": row.get("id"),
                "item_type": item_type,
                "item_id": item_id,
                "created_at": row.get("created_at"),
                "item": entity,
            }
        )
    return items


@bp.route("/favorites/items", methods=["GET"])
@require_auth
def list_member_favorite_items():
    sb = get_supabase_admin()
    item_type = (request.args.get("item_type") or "").strip().lower()
    if item_type and item_type not in ALLOWED_FAVORITE_TYPES:
        return jsonify({"error": "item_type must be workout or nutrition"}), 400

    items = _load_member_favorite_snapshots(sb)
    if item_type:
        items = [row for row in items if row.get("item_type") == item_type]
    return jsonify({"favorites": items})


@bp.route("/favorites/items/ids", methods=["GET"])
@require_auth
def list_member_favorite_ids():
    sb = get_supabase_admin()
    rows = _result_data(
        sb.table("member_favorite_items")
        .select("item_type, item_id")
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    by_type = {"workout": [], "nutrition": []}
    for row in rows:
        item_type = row.get("item_type")
        if item_type in by_type:
            by_type[item_type].append(int(row.get("item_id", 0)))
    return jsonify(by_type)


@bp.route("/favorites/items", methods=["POST"])
@require_auth
def add_member_favorite_item():
    body = request.get_json(silent=True) or {}
    item_type = (body.get("item_type") or "").strip().lower()
    item_id = body.get("item_id")
    if item_type not in ALLOWED_FAVORITE_TYPES:
        return jsonify({"error": "item_type must be workout or nutrition"}), 400
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return jsonify({"error": "item_id is required"}), 400

    sb = get_supabase_admin()
    if item_type == "workout":
        exists = (
            sb.table("workout_logs")
            .select("id")
            .eq("tenant_id", g.tenant_id)
            .eq("user_id", g.user_id)
            .eq("id", item_id)
            .maybe_single()
            .execute()
        )
    else:
        exists = (
            sb.table("nutrition_logs")
            .select("id")
            .eq("tenant_id", g.tenant_id)
            .eq("user_id", g.user_id)
            .eq("id", item_id)
            .maybe_single()
            .execute()
        )
    if not getattr(exists, "data", None):
        return jsonify({"error": "Item not found"}), 404

    try:
        result = (
            sb.table("member_favorite_items")
            .insert(
                {
                    "tenant_id": g.tenant_id,
                    "user_id": g.user_id,
                    "item_type": item_type,
                    "item_id": item_id,
                }
            )
            .execute()
        )
    except Exception as exc:
        text = str(exc).lower()
        if "duplicate key" in text or "unique" in text:
            return jsonify({"message": "Already favorited"}), 200
        raise

    data = _result_data(result)
    return jsonify({"favorite": data[0] if data else None}), 201


@bp.route("/favorites/items/<string:item_type>/<int:item_id>", methods=["DELETE"])
@require_auth
def remove_member_favorite_item(item_type: str, item_id: int):
    normalized_type = item_type.strip().lower()
    if normalized_type not in ALLOWED_FAVORITE_TYPES:
        return jsonify({"error": "item_type must be workout or nutrition"}), 400

    sb = get_supabase_admin()
    result = (
        sb.table("member_favorite_items")
        .delete()
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .eq("item_type", normalized_type)
        .eq("item_id", item_id)
        .execute()
    )
    data = _result_data(result)
    if not data:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"message": "Removed"}), 200
