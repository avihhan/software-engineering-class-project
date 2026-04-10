import os
from datetime import UTC, datetime

from flask import Blueprint, current_app, g, jsonify, request

from app.auth import get_supabase_admin, require_auth
from app.services.billing_service import (
    ensure_member_billing_status,
    get_member_billing_snapshot,
    get_tenant_billing_config,
)
from app.services.lemon_squeezy_service import (
    create_checkout,
    verify_webhook_signature,
)

bp = Blueprint("billing", __name__)


def _is_postgrest_missing_response(exc: Exception) -> bool:
    text = str(exc).lower()
    return "missing response" in text and (
        "'code': '204'" in text or '"code": "204"' in text
    )


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()




def _get_user_created_at(sb, user_id: int, tenant_id: int) -> str | None:
    result = (
        sb.table("users")
        .select("created_at")
        .eq("id", user_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return result.data.get("created_at")


@bp.route("/billing/me", methods=["GET"])
@require_auth
def get_my_billing():
    sb = get_supabase_admin()
    created_at = _get_user_created_at(sb, g.user_id, g.tenant_id)
    snapshot = get_member_billing_snapshot(
        sb,
        tenant_id=g.tenant_id,
        user_id=g.user_id,
        user_created_at=created_at,
    )
    return jsonify({"billing": snapshot})


@bp.route("/billing/checkout", methods=["POST"])
@require_auth
def create_my_checkout():
    sb = get_supabase_admin()
    created_at = _get_user_created_at(sb, g.user_id, g.tenant_id)
    config = get_tenant_billing_config(sb, g.tenant_id)
    snapshot = get_member_billing_snapshot(
        sb,
        tenant_id=g.tenant_id,
        user_id=g.user_id,
        user_created_at=created_at,
    )

    if not config["enabled"]:
        return jsonify({"error": "Billing is not enabled for this tenant"}), 400
    if not config.get("variant_id") or not config.get("store_id"):
        return jsonify({"error": "Tenant billing configuration is incomplete"}), 400
    if not snapshot["requires_payment"] and snapshot["status"] in {"active", "paid"}:
        return jsonify({"error": "Payment is already active"}), 400

    api_key = (
        os.environ.get("LEMON_SQUEEZY_API_KEY", "").strip()
        or os.environ.get("LEMONSQUEEZY_API_KEY", "").strip()
    )
    if not api_key:
        return (
            jsonify(
                {
                    "error": (
                        "Missing server Lemon Squeezy API key "
                        "(set LEMON_SQUEEZY_API_KEY or LEMONSQUEEZY_API_KEY)"
                    )
                }
            ),
            500,
        )

    success_redirect_url = os.environ.get(
        "LEMON_SQUEEZY_REDIRECT_URL", ""
    ).strip() or request.headers.get("Origin", "").strip()

    try:
        checkout = create_checkout(
            api_key=api_key,
            store_id=str(config["store_id"]),
            variant_id=str(config["variant_id"]),
            member_email=g.email,
            tenant_id=g.tenant_id,
            user_id=g.user_id,
            success_redirect_url=success_redirect_url or None,
        )
    except RuntimeError as exc:
        current_app.logger.exception("Unable to create Lemon Squeezy checkout")
        return jsonify({"error": str(exc)}), 502

    ensure_member_billing_status(
        sb,
        tenant_id=g.tenant_id,
        user_id=g.user_id,
        user_created_at=created_at,
        trial_days=config["trial_days"],
    )
    try:
        sb.table("tenant_member_billing_status").update(
            {
                "last_checkout_url": checkout["checkout_url"],
                "last_checkout_at": _utc_now_iso(),
            }
        ).eq("tenant_id", g.tenant_id).eq("user_id", g.user_id).execute()
    except Exception as exc:
        if not _is_postgrest_missing_response(exc):
            raise

    return jsonify({"checkout_url": checkout["checkout_url"]}), 201


def _extract_ids(payload: dict):
    meta = payload.get("meta") or {}
    custom_data = meta.get("custom_data") or {}
    tenant_id = custom_data.get("tenant_id")
    user_id = custom_data.get("user_id")
    data = payload.get("data") or {}
    attributes = data.get("attributes") or {}
    subscription_id = attributes.get("subscription_id") or data.get("id")
    customer_id = attributes.get("customer_id")
    order_id = attributes.get("order_id")
    return tenant_id, user_id, subscription_id, customer_id, order_id


@bp.route("/billing/webhook/lemon-squeezy", methods=["POST"])
def lemon_webhook():
    raw_body = request.get_data()
    signature = request.headers.get("X-Signature", "")
    webhook_secret = os.environ.get("LEMON_SQUEEZY_WEBHOOK_SECRET", "").strip()

    if webhook_secret and not verify_webhook_signature(raw_body, signature, webhook_secret):
        return jsonify({"error": "Invalid webhook signature"}), 401

    payload = request.get_json(silent=True) or {}
    event_name = ((payload.get("meta") or {}).get("event_name") or "").lower()
    tenant_id, user_id, subscription_id, customer_id, order_id = _extract_ids(payload)
    if not tenant_id or not user_id:
        return jsonify({"message": "Webhook accepted without tenant/user mapping"}), 202
    try:
        tenant_id = int(tenant_id)
        user_id = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid webhook tenant/user mapping"}), 400

    sb = get_supabase_admin()
    user = (
        sb.table("users")
        .select("created_at")
        .eq("id", user_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not user.data:
        return jsonify({"error": "Mapped user not found"}), 404

    config = get_tenant_billing_config(sb, tenant_id)
    ensure_member_billing_status(
        sb,
        tenant_id=tenant_id,
        user_id=user_id,
        user_created_at=user.data.get("created_at"),
        trial_days=config["trial_days"],
    )

    status_update = {
        "lemon_subscription_id": str(subscription_id) if subscription_id else None,
        "lemon_customer_id": str(customer_id) if customer_id else None,
        "lemon_order_id": str(order_id) if order_id else None,
    }
    if event_name in {
        "order_created",
        "subscription_created",
        "subscription_updated",
        "subscription_payment_success",
    }:
        status_update["status"] = "active"
        status_update["paid_at"] = _utc_now_iso()
    elif event_name in {"subscription_payment_failed"}:
        status_update["status"] = "past_due"
    elif event_name in {"subscription_cancelled", "subscription_expired"}:
        status_update["status"] = "cancelled"

    try:
        sb.table("tenant_member_billing_status").update(status_update).eq(
            "tenant_id", tenant_id
        ).eq("user_id", user_id).execute()
    except Exception as exc:
        if not _is_postgrest_missing_response(exc):
            raise

    return jsonify({"message": "ok"})
