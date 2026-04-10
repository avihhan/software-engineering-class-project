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


def _request_json(
    *,
    api_key: str,
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/vnd.api+json"

    req = request.Request(
        f"{LEMON_API_BASE}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Lemon Squeezy API failed ({path}): {details}") from exc
    except Exception as exc:
        raise RuntimeError(f"Lemon Squeezy API request failed ({path})") from exc


def list_test_mode_assets(api_key: str) -> dict[str, Any]:
    stores_resp = _request_json(api_key=api_key, path="/stores?page[size]=100")
    variants_resp = _request_json(api_key=api_key, path="/variants?page[size]=250")

    stores: list[dict[str, Any]] = []
    for item in stores_resp.get("data") or []:
        attrs = item.get("attributes") or {}
        stores.append(
            {
                "id": item.get("id"),
                "name": attrs.get("name"),
                "slug": attrs.get("slug"),
                "status": attrs.get("status"),
            }
        )

    variants: list[dict[str, Any]] = []
    for item in variants_resp.get("data") or []:
        attrs = item.get("attributes") or {}
        rel = item.get("relationships") or {}
        product_rel = ((rel.get("product") or {}).get("data") or {})
        variants.append(
            {
                "id": item.get("id"),
                "name": attrs.get("name"),
                "status": attrs.get("status"),
                "price": attrs.get("price"),
                "product_id": product_rel.get("id"),
            }
        )

    return {"stores": stores, "variants": variants}


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

    try:
        body = _request_json(
            api_key=api_key,
            path="/checkouts",
            method="POST",
            payload=payload,
        )
    except RuntimeError as exc:
        raise RuntimeError(str(exc).replace("API failed (/checkouts)", "checkout failed")) from exc

    data = body.get("data") or {}
    attributes = data.get("attributes") or {}
    checkout_url = attributes.get("url")
    checkout_id = data.get("id")
    if not checkout_url:
        raise RuntimeError("Lemon Squeezy did not return a checkout URL")

    return {"checkout_url": checkout_url, "checkout_id": checkout_id, "raw": body}
