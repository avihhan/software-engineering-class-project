from flask import Blueprint, g, jsonify, request
from app.auth import get_supabase_admin, require_auth
from app.services.nutrition_targets_service import (
    calculate_targets,
    get_latest_body_metric,
    get_user_nutrition_profile,
    upsert_user_nutrition_profile,
)

bp = Blueprint("body_metrics", __name__)
ALLOWED_SEX = {"male", "female"}
ALLOWED_ACTIVITY_LEVEL = {"sedentary", "light", "moderate", "very_active", "extra_active"}
ALLOWED_GOAL = {"lose", "maintain", "gain"}


def _is_missing_column_error(exc: Exception, column_name: str) -> bool:
    text = str(exc).lower()
    return (
        "could not find the" in text
        and "column" in text
        and column_name.lower() in text
        and "schema cache" in text
    )


def _body_metrics_insert_with_fallback(sb, row: dict):
    try:
        return sb.table("body_metrics").insert(row).execute()
    except Exception as exc:
        if not (
            _is_missing_column_error(exc, "height_feet")
            or _is_missing_column_error(exc, "height_inches")
        ):
            raise
        legacy_row = dict(row)
        legacy_row.pop("height_feet", None)
        legacy_row.pop("height_inches", None)
        return sb.table("body_metrics").insert(legacy_row).execute()


def _latest_metric_defaults(sb, tenant_id: int, user_id: int) -> dict:
    try:
        result = (
            sb.table("body_metrics")
            .select("weight,height,height_feet,height_inches,body_fat_percentage")
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else {}
    except Exception as exc:
        if _is_missing_column_error(exc, "height_feet") or _is_missing_column_error(
            exc, "height_inches"
        ):
            fallback = (
                sb.table("body_metrics")
                .select("weight,height,body_fat_percentage")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .order("recorded_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = fallback.data or []
            return rows[0] if rows else {}
        raise


def _body_metrics_update_with_fallback(sb, metric_id: int, tenant_id: int, user_id: int, allowed: dict):
    try:
        return (
            sb.table("body_metrics")
            .update(allowed)
            .eq("id", metric_id)
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        if not (
            _is_missing_column_error(exc, "height_feet")
            or _is_missing_column_error(exc, "height_inches")
        ):
            raise
        legacy_allowed = dict(allowed)
        legacy_allowed.pop("height_feet", None)
        legacy_allowed.pop("height_inches", None)
        return (
            sb.table("body_metrics")
            .update(legacy_allowed)
            .eq("id", metric_id)
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .execute()
        )


def _normalize_height_fields(payload: dict) -> tuple[int | None, int | None, float | None]:
    feet = payload.get("height_feet")
    inches = payload.get("height_inches")
    legacy = payload.get("height")

    feet_num = int(feet) if feet not in (None, "") else None
    inches_num = int(inches) if inches not in (None, "") else None

    if feet_num is None and inches_num is None and legacy not in (None, ""):
        raw = float(legacy)
        if raw >= 96:
            total_inches = raw / 2.54
        else:
            total_inches = raw
        feet_num = int(total_inches // 12)
        inches_num = int(round(total_inches - feet_num * 12))

    if inches_num is not None and inches_num >= 12:
        feet_num = (feet_num or 0) + (inches_num // 12)
        inches_num = inches_num % 12

    legacy_height = None
    if feet_num is not None or inches_num is not None:
        legacy_height = float((feet_num or 0) * 12 + (inches_num or 0))

    return feet_num, inches_num, legacy_height


def _serialize_metric(row: dict) -> dict:
    feet = row.get("height_feet")
    inches = row.get("height_inches")
    if feet is None and inches is None and row.get("height") not in (None, ""):
        raw = float(row.get("height"))
        if raw >= 96:
            total_inches = raw / 2.54
        else:
            total_inches = raw
        feet = int(total_inches // 12)
        inches = int(round(total_inches - feet * 12))

    return {
        **row,
        "height_feet": feet,
        "height_inches": inches,
    }


def _validate_questionnaire_payload(payload: dict) -> tuple[dict, str | None]:
    sex = (payload.get("sex") or "").strip().lower()
    activity_level = (payload.get("activity_level") or "").strip().lower()
    goal = (payload.get("goal") or "").strip().lower()
    age_years = payload.get("age_years")

    if sex not in ALLOWED_SEX:
        return {}, "sex must be one of: male, female"
    if activity_level not in ALLOWED_ACTIVITY_LEVEL:
        return {}, (
            "activity_level must be one of: sedentary, light, moderate, "
            "very_active, extra_active"
        )
    if goal not in ALLOWED_GOAL:
        return {}, "goal must be one of: lose, maintain, gain"
    try:
        age_num = int(age_years)
    except (TypeError, ValueError):
        return {}, "age_years must be an integer"
    if age_num < 13 or age_num > 120:
        return {}, "age_years must be between 13 and 120"

    return {
        "sex": sex,
        "age_years": age_num,
        "activity_level": activity_level,
        "goal": goal,
    }, None


@bp.route("/body-metrics", methods=["POST"])
@require_auth
def create_body_metric():
    body = request.get_json(silent=True) or {}

    recorded_at = body.get("recorded_at")
    if not recorded_at:
        return jsonify({"error": "recorded_at is required"}), 400

    row = {
        "tenant_id": g.tenant_id,
        "user_id": g.user_id,
        "recorded_at": recorded_at,
    }
    if "weight" in body:
        row["weight"] = body["weight"]
    height_feet, height_inches, legacy_height = _normalize_height_fields(body)
    if height_feet is not None or height_inches is not None:
        row["height_feet"] = height_feet
        row["height_inches"] = height_inches
    if legacy_height is not None:
        row["height"] = legacy_height
    if "body_fat_percentage" in body:
        row["body_fat_percentage"] = body["body_fat_percentage"]

    sb = get_supabase_admin()
    previous = _latest_metric_defaults(sb, g.tenant_id, g.user_id)

    if "weight" not in row and previous.get("weight") not in (None, ""):
        row["weight"] = previous.get("weight")

    has_explicit_height = (
        height_feet is not None
        or height_inches is not None
        or legacy_height is not None
    )
    if not has_explicit_height and previous:
        prev_feet = previous.get("height_feet")
        prev_inches = previous.get("height_inches")
        prev_height = previous.get("height")
        if prev_feet is not None or prev_inches is not None:
            row["height_feet"] = prev_feet
            row["height_inches"] = prev_inches
            row["height"] = float((prev_feet or 0) * 12 + (prev_inches or 0))
        elif prev_height not in (None, ""):
            row["height"] = prev_height

    if "body_fat_percentage" not in row and previous.get("body_fat_percentage") not in (
        None,
        "",
    ):
        row["body_fat_percentage"] = previous.get("body_fat_percentage")

    result = _body_metrics_insert_with_fallback(sb, row)

    if not result.data:
        return jsonify({"error": "Insert failed"}), 500

    return jsonify({"body_metric": _serialize_metric(result.data[0])}), 201


@bp.route("/body-metrics", methods=["GET"])
@require_auth
def list_body_metrics():
    sb = get_supabase_admin()
    result = (
        sb.table("body_metrics")
        .select("*")
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    return jsonify({"body_metrics": [_serialize_metric(r) for r in (result.data or [])]})


@bp.route("/body-metrics/questionnaire", methods=["GET"])
@require_auth
def get_body_metrics_questionnaire():
    sb = get_supabase_admin()
    profile = get_user_nutrition_profile(sb, g.tenant_id, g.user_id)
    latest_metric = get_latest_body_metric(sb, g.tenant_id, g.user_id)
    recommendations = calculate_targets(profile, latest_metric)
    return jsonify(
        {
            "questionnaire": profile,
            "recommendations": recommendations,
        }
    )


@bp.route("/body-metrics/questionnaire", methods=["PUT"])
@require_auth
def update_body_metrics_questionnaire():
    body = request.get_json(silent=True) or {}
    normalized, error = _validate_questionnaire_payload(body)
    if error:
        return jsonify({"error": error}), 400

    sb = get_supabase_admin()
    try:
        profile = upsert_user_nutrition_profile(sb, g.tenant_id, g.user_id, normalized)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    latest_metric = get_latest_body_metric(sb, g.tenant_id, g.user_id)
    recommendations = calculate_targets(profile, latest_metric)
    return jsonify(
        {
            "questionnaire": profile,
            "recommendations": recommendations,
        }
    )


@bp.route("/body-metrics/recommendations", methods=["GET"])
@require_auth
def get_body_metrics_recommendations():
    sb = get_supabase_admin()
    profile = get_user_nutrition_profile(sb, g.tenant_id, g.user_id)
    latest_metric = get_latest_body_metric(sb, g.tenant_id, g.user_id)
    recommendations = calculate_targets(profile, latest_metric)
    return jsonify({"recommendations": recommendations})


@bp.route("/body-metrics/<int:metric_id>", methods=["GET"])
@require_auth
def get_body_metric(metric_id):
    sb = get_supabase_admin()
    result = (
        sb.table("body_metrics")
        .select("*")
        .eq("id", metric_id)
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        return jsonify({"error": "Not found"}), 404

    return jsonify({"body_metric": _serialize_metric(result.data)})


@bp.route("/body-metrics/<int:metric_id>", methods=["PUT"])
@require_auth
def update_body_metric(metric_id):
    body = request.get_json(silent=True) or {}

    allowed = {}
    for field in ("weight", "body_fat_percentage", "recorded_at"):
        if field in body:
            allowed[field] = body[field]
    if any(k in body for k in ("height", "height_feet", "height_inches")):
        height_feet, height_inches, legacy_height = _normalize_height_fields(body)
        allowed["height_feet"] = height_feet
        allowed["height_inches"] = height_inches
        allowed["height"] = legacy_height

    if not allowed:
        return jsonify({"error": "No updatable fields provided"}), 400

    sb = get_supabase_admin()
    result = _body_metrics_update_with_fallback(
        sb, metric_id, g.tenant_id, g.user_id, allowed
    )

    if not result.data:
        return jsonify({"error": "Not found or update failed"}), 404

    return jsonify({"body_metric": _serialize_metric(result.data[0])})


@bp.route("/body-metrics/<int:metric_id>", methods=["DELETE"])
@require_auth
def delete_body_metric(metric_id):
    sb = get_supabase_admin()
    result = (
        sb.table("body_metrics")
        .delete()
        .eq("id", metric_id)
        .eq("tenant_id", g.tenant_id)
        .eq("user_id", g.user_id)
        .execute()
    )

    if not result.data:
        return jsonify({"error": "Not found"}), 404

    return jsonify({"message": "Deleted"}), 200
