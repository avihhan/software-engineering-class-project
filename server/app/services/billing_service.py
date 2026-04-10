from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

DEFAULT_TRIAL_DAYS = 7
PAID_STATUSES = {"active", "paid"}


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _is_postgrest_missing_response(exc: Exception) -> bool:
    text = str(exc).lower()
    return "missing response" in text and "'code': '204'" in text


def get_tenant_billing_config(sb, tenant_id: int) -> dict[str, Any]:
    data: dict[str, Any] = {}
    try:
        result = (
            sb.table("tenant_billing_configs")
            .select("*")
            .eq("tenant_id", tenant_id)
            .maybe_single()
            .execute()
        )
        data = result.data or {}
    except Exception as exc:
        # Some local/dev setups hit a postgrest-py "Missing response" bug.
        # Treat as "no config row yet" so the caller can proceed with defaults.
        if _is_postgrest_missing_response(exc):
            data = {}
        else:
            raise
    return {
        "tenant_id": tenant_id,
        "provider": data.get("provider", "lemon_squeezy"),
        "enabled": bool(data.get("enabled", False)),
        "trial_days": _safe_int(data.get("trial_days"), DEFAULT_TRIAL_DAYS),
        "store_id": data.get("store_id"),
        "product_id": data.get("product_id"),
        "variant_id": data.get("variant_id"),
        "plan_name": data.get("plan_name"),
        "plan_description": data.get("plan_description"),
        "offer_description": data.get("offer_description"),
        "price_cents": _safe_int(data.get("price_cents"), 0),
        "currency": (data.get("currency") or "USD").upper(),
        "discount_type": data.get("discount_type") or "none",
        "discount_value": data.get("discount_value"),
    }


def _compute_discounted_price_cents(config: dict[str, Any]) -> int:
    base = max(_safe_int(config.get("price_cents")), 0)
    discount_type = config.get("discount_type") or "none"
    discount_value = float(config.get("discount_value") or 0)
    if discount_type == "percent":
        discount_value = max(0.0, min(discount_value, 100.0))
        discounted = int(round(base * (1 - (discount_value / 100.0))))
    elif discount_type == "amount":
        discounted = base - int(round(max(0.0, discount_value) * 100))
    else:
        discounted = base
    return max(discounted, 0)


def ensure_member_billing_status(
    sb,
    *,
    tenant_id: int,
    user_id: int,
    user_created_at: str | None,
    trial_days: int,
) -> dict[str, Any]:
    trial_days = max(_safe_int(trial_days, DEFAULT_TRIAL_DAYS), 0)
    created_dt = _parse_datetime(user_created_at) or _utc_now()
    trial_ends_at = created_dt + timedelta(days=trial_days)
    trial_ends_iso = trial_ends_at.isoformat()

    existing = (
        sb.table("tenant_member_billing_status")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        return existing.data

    inserted = (
        sb.table("tenant_member_billing_status")
        .insert(
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "status": "trialing",
                "trial_ends_at": trial_ends_iso,
            }
        )
        .execute()
    )
    if inserted.data:
        return inserted.data[0]

    fallback = (
        sb.table("tenant_member_billing_status")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return fallback.data or {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "status": "trialing",
        "trial_ends_at": trial_ends_iso,
    }


def get_member_billing_snapshot(
    sb,
    *,
    tenant_id: int,
    user_id: int,
    user_created_at: str | None,
) -> dict[str, Any]:
    config = get_tenant_billing_config(sb, tenant_id)
    billing_status = ensure_member_billing_status(
        sb,
        tenant_id=tenant_id,
        user_id=user_id,
        user_created_at=user_created_at,
        trial_days=config["trial_days"],
    )

    trial_ends = _parse_datetime(billing_status.get("trial_ends_at"))
    now = _utc_now()
    status = (billing_status.get("status") or "trialing").lower()
    billing_enabled = bool(config.get("enabled"))

    if not billing_enabled:
        requires_payment = False
    elif status in PAID_STATUSES:
        requires_payment = False
    elif trial_ends is None:
        requires_payment = False
    else:
        requires_payment = now >= trial_ends

    effective_price_cents = _compute_discounted_price_cents(config)

    return {
        "billing_enabled": billing_enabled,
        "requires_payment": requires_payment,
        "status": status,
        "trial_days": config["trial_days"],
        "trial_ends_at": billing_status.get("trial_ends_at"),
        "now": now.isoformat(),
        "plan": {
            "name": config.get("plan_name"),
            "description": config.get("plan_description"),
            "offer_description": config.get("offer_description"),
            "price_cents": config.get("price_cents"),
            "currency": config.get("currency"),
            "discount_type": config.get("discount_type"),
            "discount_value": config.get("discount_value"),
            "effective_price_cents": effective_price_cents,
        },
        "provider": {
            "name": config.get("provider"),
            "variant_id": config.get("variant_id"),
        },
        "checkout": {
            "last_checkout_url": billing_status.get("last_checkout_url"),
            "last_checkout_at": billing_status.get("last_checkout_at"),
        },
    }
