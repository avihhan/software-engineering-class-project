import random
import re

from app.utils import PLATFORM_TENANT_ID


REGISTRATION_CODE_RE = re.compile(r"^\d{6}$")


def generate_registration_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def is_valid_registration_code(code: str) -> bool:
    return bool(REGISTRATION_CODE_RE.fullmatch(code))


def _is_missing_column_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "42703" in text or (
        "registration_code" in text and "does not exist" in text
    )


def ensure_tenant_registration_code(sb, tenant_id: int, current_code: str | None) -> str:
    if current_code and is_valid_registration_code(current_code):
        return current_code
    return reset_tenant_registration_code(sb, tenant_id)


def resolve_tenant_by_registration_code(sb, registration_code: str):
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
        if _is_missing_column_error(exc):
            raise RuntimeError(
                "Registration code column is missing. Apply migration 003_tenant_registration_code.sql."
            ) from exc
        raise


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

        try:
            (
                sb.table("tenants")
                .update({"registration_code": candidate})
                .eq("id", tenant_id)
                .execute()
            )
            return candidate
        except Exception as exc:
            if _is_missing_column_error(exc):
                raise RuntimeError(
                    "Registration code column is missing. Apply migration 003_tenant_registration_code.sql."
                ) from exc
            raise

    raise RuntimeError("Unable to generate unique registration code")
