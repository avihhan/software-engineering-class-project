from flask import Blueprint, g, jsonify, request
from app.auth import get_supabase_admin, require_auth, require_role
from app.registration_code import (
    default_registration_code_for_tenant,
    reset_tenant_registration_code,
)

bp = Blueprint("platform", __name__)


@bp.route("/tenants", methods=["GET"])
@require_auth
@require_role("super_admin")
def list_tenants():
    """List all tenants with user counts (platform admin only)."""
    sb = get_supabase_admin()
    tenants = (
        sb.table("tenants")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return jsonify({"tenants": tenants.data or []})


@bp.route("/tenants", methods=["POST"])
@require_auth
@require_role("super_admin")
def create_tenant():
    """Create a new tenant + owner user (platform admin only)."""
    body = request.get_json(silent=True) or {}

    tenant_name = body.get("tenant_name", "").strip()
    owner_email = body.get("owner_email", "").strip()
    owner_password = body.get("owner_password", "")

    if not tenant_name or not owner_email or not owner_password:
        return (
            jsonify(
                {
                    "error": "tenant_name, owner_email, and owner_password are required"
                }
            ),
            400,
        )

    sb = get_supabase_admin()

    tenant_result = (
        sb.table("tenants")
        .insert({"name": tenant_name, "email": owner_email})
        .execute()
    )
    if not tenant_result.data:
        return jsonify({"error": "Failed to create tenant"}), 500

    tenant = tenant_result.data[0]
    try:
        tenant["registration_code"] = reset_tenant_registration_code(sb, tenant["id"])
    except Exception as exc:
        if "42703" in str(exc) and "registration_code" in str(exc):
            tenant["registration_code"] = default_registration_code_for_tenant(tenant["id"])
        else:
            sb.table("tenants").delete().eq("id", tenant["id"]).execute()
            return jsonify({"error": "Failed to create registration code"}), 500

    try:
        auth_resp = sb.auth.admin.create_user(
            {
                "email": owner_email,
                "password": owner_password,
                "email_confirm": True,
            }
        )
    except Exception as exc:
        sb.table("tenants").delete().eq("id", tenant["id"]).execute()
        return jsonify({"error": str(exc)}), 400

    auth_user = auth_resp.user
    if not auth_user:
        sb.table("tenants").delete().eq("id", tenant["id"]).execute()
        return jsonify({"error": "Failed to create owner user"}), 500

    sb.table("users").insert(
        {
            "auth_id": str(auth_user.id),
            "tenant_id": tenant["id"],
            "email": owner_email,
            "password_hash": "managed-by-supabase-auth",
            "role": "owner",
            "is_email_verified": True,
        }
    ).execute()

    return jsonify({"tenant": tenant}), 201


@bp.route("/tenants/<int:tenant_id>", methods=["GET"])
@require_auth
@require_role("super_admin")
def get_tenant(tenant_id):
    sb = get_supabase_admin()
    tenant = (
        sb.table("tenants")
        .select("*")
        .eq("id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not tenant or not tenant.data:
        return jsonify({"error": "Tenant not found"}), 404

    users = (
        sb.table("users")
        .select("id, email, role, created_at")
        .eq("tenant_id", tenant_id)
        .execute()
    )

    return jsonify(
        {"tenant": tenant.data, "users": users.data or []}
    )


@bp.route("/tenants/<int:tenant_id>", methods=["PUT"])
@require_auth
@require_role("super_admin")
def update_tenant(tenant_id):
    body = request.get_json(silent=True) or {}

    allowed = {}
    for field in (
        "name",
        "logo_url",
        "primary_color",
        "secondary_color",
        "custom_domain",
        "ai_enabled",
    ):
        if field in body:
            allowed[field] = body[field]

    if not allowed:
        return jsonify({"error": "No updatable fields provided"}), 400

    sb = get_supabase_admin()
    result = (
        sb.table("tenants").update(allowed).eq("id", tenant_id).execute()
    )

    if not result.data:
        return jsonify({"error": "Tenant not found"}), 404

    return jsonify({"tenant": result.data[0]})


@bp.route("/tenants/<int:tenant_id>", methods=["DELETE"])
@require_auth
@require_role("super_admin")
def delete_tenant(tenant_id):
    from app.utils import PLATFORM_TENANT_ID

    if tenant_id == PLATFORM_TENANT_ID:
        return jsonify({"error": "Cannot delete the platform tenant"}), 403

    sb = get_supabase_admin()
    sb.table("tenants").delete().eq("id", tenant_id).execute()
    return jsonify({"message": "Tenant deleted"}), 200


@bp.route("/analytics", methods=["GET"])
@require_auth
@require_role("super_admin")
def platform_analytics():
    """Aggregate stats across the entire platform."""
    sb = get_supabase_admin()

    tenants = sb.table("tenants").select("id", count="exact").execute()
    users = sb.table("users").select("id", count="exact").execute()
    owners = (
        sb.table("users")
        .select("id", count="exact")
        .eq("role", "owner")
        .execute()
    )
    members = (
        sb.table("users")
        .select("id", count="exact")
        .eq("role", "member")
        .execute()
    )

    return jsonify(
        {
            "total_tenants": tenants.count or 0,
            "total_users": users.count or 0,
            "total_owners": owners.count or 0,
            "total_members": members.count or 0,
        }
    )


@bp.route("/admins", methods=["GET"])
@require_auth
@require_role("super_admin")
def list_admins():
    """List all platform admin users."""
    sb = get_supabase_admin()
    result = (
        sb.table("users")
        .select("id, email, role, created_at")
        .eq("role", "super_admin")
        .execute()
    )
    return jsonify({"admins": result.data or []})


@bp.route("/admins", methods=["POST"])
@require_auth
@require_role("super_admin")
def create_admin():
    """Create a new platform admin user."""
    from app.utils import PLATFORM_TENANT_ID

    body = request.get_json(silent=True) or {}
    email = body.get("email", "").strip()
    password = body.get("password", "")

    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400

    sb = get_supabase_admin()

    try:
        auth_resp = sb.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True}
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    auth_user = auth_resp.user
    if not auth_user:
        return jsonify({"error": "Failed to create auth user"}), 500

    sb.table("users").insert(
        {
            "auth_id": str(auth_user.id),
            "tenant_id": PLATFORM_TENANT_ID,
            "email": email,
            "password_hash": "managed-by-supabase-auth",
            "role": "super_admin",
            "is_email_verified": True,
        }
    ).execute()

    return jsonify(
        {"admin": {"email": email, "role": "super_admin"}}
    ), 201
