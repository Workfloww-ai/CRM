from fastapi import HTTPException, Depends
from auth.dependencies import get_current_user
from db.queries import get_profile_role
from db.client import get_client_for_user


def require_admin(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    profile = get_profile_role(client, user.id)

    if profile.data["role_level"] < 1:
        raise HTTPException(status_code=403, detail="Only admins can perform this action")

    return user

def require_super_admin(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    profile = get_profile_role(client, user.id)

    if profile.data["role_level"] < 2:
        raise HTTPException(status_code=403, detail="Only super admins can perform this action")

    return user


def require_crm_access(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = client.table("profiles").select(
        "role_level, department, secondary_department, can_access_crm"
    ).eq("id", user.id).single().execute()

    if not res or not res.data:
        raise HTTPException(status_code=403, detail="User profile not found")

    p = res.data
    is_admin = (p.get("role_level") or 0) >= 1
    can_access = bool(p.get("can_access_crm"))
    dept = (p.get("department") or "").lower()
    sec_dept = (p.get("secondary_department") or "").lower()
    is_growth = dept == "growth" or sec_dept == "growth"

    if not (is_admin or can_access or is_growth):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access the CRM. Only Growth and Leadership team members have access."
        )

    return user


def require_hrms_manager(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = client.table("profiles").select("role_level, hrms_role, role_id, hrms_roles(name)").eq("id", user.id).single().execute()
    if not res or not res.data:
        raise HTTPException(status_code=403, detail="User profile not found")

    p = res.data
    role_level = p.get("role_level") or 0
    hrms_role = (p.get("hrms_role") or "").lower()
    role_rel = p.get("hrms_roles")
    role_name = role_rel.get("name") if isinstance(role_rel, dict) else ""

    if role_level < 1 and hrms_role != "manager" and role_name != "manager":
        raise HTTPException(status_code=403, detail="Only managers can perform this action")

    return user

# Aliases for backward compatibility
require_hrms_manager_or_admin = require_hrms_manager
require_hrms_admin = require_hrms_manager