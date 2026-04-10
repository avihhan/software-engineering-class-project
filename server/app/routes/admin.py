from flask import Blueprint, current_app, g, jsonify, request
from app.auth import get_supabase_admin, require_auth, require_role
from app.registration_code import (
    ensure_tenant_registration_code,
    reset_tenant_registration_code,
)
from app.services.billing_service import get_tenant_billing_config
from app.services.lemon_squeezy_service import list_test_mode_assets

bp = Blueprint("admin", __name__)


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
                "id, name, logo_url, primary_color, secondary_color, custom_domain, registration_code"
            )
            .eq("id", g.tenant_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        # Fallbacks:
        # - occasional postgrest-py "Missing response" bug (code 204)
        if _can_use_branding_fallback(exc):
            try:
                result = (
                    sb.table("tenants")
                    .select("id, name, logo_url, primary_color, secondary_color, custom_domain")
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
    for field in ("name", "logo_url", "primary_color", "secondary_color", "custom_domain"):
        if field in body:
            allowed[field] = body[field]
    if not allowed:
        return jsonify({"error": "No updatable fields provided"}), 400

    sb = get_supabase_admin()
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
    """Send weekly summary emails to all members of the tenant."""
    from app.services.email_service import send_weekly_summary
    from app.services.streak_service import calculate_streak

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
        .select("name")
        .eq("id", g.tenant_id)
        .maybe_single()
        .execute()
    )
    tenant_name = tenant.data["name"] if tenant.data else "AuraFit"

    sent_count = 0
    for m in (members.data or []):
        workouts = (
            sb.table("workout_logs")
            .select("workout_date")
            .eq("user_id", m["id"])
            .eq("tenant_id", g.tenant_id)
            .execute()
        )
        dates = [w["workout_date"] for w in (workouts.data or [])]
        stats = calculate_streak(dates)

        nutrition = (
            sb.table("nutrition_logs")
            .select("calories")
            .eq("user_id", m["id"])
            .eq("tenant_id", g.tenant_id)
            .execute()
        )
        cals = [n["calories"] for n in (nutrition.data or []) if n.get("calories")]
        avg_cal = int(sum(cals) / len(cals)) if cals else 0

        result = send_weekly_summary(
            to=m["email"],
            user_name=m["email"].split("@")[0],
            workouts_count=stats["total_workouts"],
            streak=stats["current_streak"],
            calories_avg=avg_cal,
            tenant_name=tenant_name,
        )
        if result.get("sent"):
            sent_count += 1

    return jsonify({"sent": sent_count, "total_members": len(members.data or [])})


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
