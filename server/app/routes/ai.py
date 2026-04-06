from flask import Blueprint, g, jsonify, request
from app.auth import get_supabase_admin, require_auth

bp = Blueprint("ai", __name__)


def _latest_metrics(user_id: str, tenant_id: int) -> dict:
    """Grab the user's most recent body metrics for AI context."""
    sb = get_supabase_admin()
    row = (
        sb.table("body_metrics")
        .select("weight, height, body_fat_percentage")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    return row.data if row and row.data else {}


def _active_goal(user_id: str, tenant_id: int) -> str | None:
    sb = get_supabase_admin()
    row = (
        sb.table("goals")
        .select("goal_type")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .limit(1)
        .maybe_single()
        .execute()
    )
    return row.data["goal_type"] if row and row.data else None


# ---------------------------------------------------------------------------
# Meal plan
# ---------------------------------------------------------------------------


@bp.route("/meal-plan", methods=["POST"])
@require_auth
def generate_meal_plan():
    """Generate a personalised meal plan using AI."""
    from app.services.ai_service import generate_meal_plan as _gen

    body = request.get_json(silent=True) or {}
    metrics = _latest_metrics(g.user_id, g.tenant_id)

    plan = _gen(
        goal=body.get("goal") or _active_goal(g.user_id, g.tenant_id),
        weight=metrics.get("weight"),
        height=metrics.get("height"),
        body_fat=metrics.get("body_fat_percentage"),
        dietary_prefs=body.get("dietary_prefs"),
        extra=body.get("extra"),
    )
    return jsonify({"meal_plan": plan})


# ---------------------------------------------------------------------------
# Workout plan
# ---------------------------------------------------------------------------


@bp.route("/workout-plan", methods=["POST"])
@require_auth
def generate_workout_plan():
    """Generate a personalised workout plan using AI."""
    from app.services.ai_service import generate_workout_plan as _gen

    body = request.get_json(silent=True) or {}
    metrics = _latest_metrics(g.user_id, g.tenant_id)

    plan = _gen(
        goal=body.get("goal") or _active_goal(g.user_id, g.tenant_id),
        weight=metrics.get("weight"),
        height=metrics.get("height"),
        body_fat=metrics.get("body_fat_percentage"),
        fitness_level=body.get("fitness_level"),
        extra=body.get("extra"),
    )
    return jsonify({"workout_plan": plan})
