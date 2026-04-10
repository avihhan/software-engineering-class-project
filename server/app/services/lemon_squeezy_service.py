from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from urllib import error, request


LEMON_API_BASE = "https://api.lemonsqueezy.com/v1"


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def create_checkout(
    *,
    api_key: str,
    store_id: str,
    variant_id: str,
    member_email: str,
    tenant_id: int,
    user_id: int,
    success_redirect_url: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "email": member_email,
                    "custom": {
                        "tenant_id": str(tenant_id),
                        "user_id": str(user_id),
                    },
                },
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": str(store_id)}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }
    }
    if success_redirect_url:
        payload["data"]["attributes"]["product_options"] = {
            "redirect_url": success_redirect_url
        }

    req = request.Request(
        f"{LEMON_API_BASE}/checkouts",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/vnd.api+json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Lemon Squeezy checkout failed: {details}") from exc
    except Exception as exc:
        raise RuntimeError("Lemon Squeezy checkout request failed") from exc

    data = body.get("data") or {}
    attributes = data.get("attributes") or {}
    checkout_url = attributes.get("url")
    checkout_id = data.get("id")
    if not checkout_url:
        raise RuntimeError("Lemon Squeezy did not return a checkout URL")

    return {"checkout_url": checkout_url, "checkout_id": checkout_id, "raw": body}
