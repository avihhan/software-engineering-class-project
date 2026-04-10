import random
import re

from app.utils import PLATFORM_TENANT_ID


REGISTRATION_CODE_RE = re.compile(r"^\d{6}$")


def generate_registration_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def is_valid_registration_code(code: str) -> bool:
    return bool(REGISTRATION_CODE_RE.fullmatch(code))


def default_registration_code_for_tenant(tenant_id: int) -> str:
    # Compatibility fallback when DB column/migration is missing.
    return f"{int(tenant_id) % 1000000:06d}"


def _is_missing_column_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "42703" in text or (
        "registration_code" in text and "does not exist" in text
    )


def ensure_tenant_registration_code(sb, tenant_id: int, current_code: str | None) -> str:
    if current_code and is_valid_registration_code(current_code):
        return current_code
    try:
        return reset_tenant_registration_code(sb, tenant_id)
    except Exception as exc:
        if _is_missing_column_error(exc):
            return default_registration_code_for_tenant(tenant_id)
        raise


def resolve_tenant_by_registration_code(sb, registration_code: str):
    # Preferred path (real registration_code column).
    try:
        tenant = (
            sb.table("tenants")
            .select("id, registration_code")
            .eq("registration_code", registration_code)
            .neq("id", PLATFORM_TENANT_ID)
            .maybe_single()
            .execute()
        )
        return tenant.data if tenant and tenant.data else None
    except Exception as exc:
        # Compatibility fallback when migration 003 has not been applied yet:
        # use deterministic 6-digit code derived from tenant_id.
        if not _is_missing_column_error(exc):
            raise
        tenant_id = int(registration_code)
        tenant = (
            sb.table("tenants")
            .select("id")
            .eq("id", tenant_id)
            .neq("id", PLATFORM_TENANT_ID)
            .maybe_single()
            .execute()
        )
        if not tenant or not tenant.data:
            return None
        return {
            "id": tenant.data["id"],
            "registration_code": default_registration_code_for_tenant(tenant.data["id"]),
        }


def reset_tenant_registration_code(sb, tenant_id: int) -> str:
    for _ in range(30):
        candidate = generate_registration_code()
        existing = (
            sb.table("tenants")
            .select("id")
            .eq("registration_code", candidate)
            .neq("id", tenant_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            continue

        result = (
            sb.table("tenants")
            .update({"registration_code": candidate})
            .eq("id", tenant_id)
            .execute()
        )
        if result.data:
            return candidate

    raise RuntimeError("Unable to generate unique registration code")
