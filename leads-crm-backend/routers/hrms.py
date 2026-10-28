from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from auth.dependencies import get_current_user
from auth.permissions import (
    require_hrms_manager,
    require_hrms_manager_or_admin,
    require_hrms_admin,
    require_crm_access
)
from db.client import get_client_for_user
from db.queries import (
    get_hrms_profile,
    update_hrms_profile,
    get_all_team_members,
    update_team_member_admin,
    sync_member_departments,
    get_leave_balance,
    deduct_leave_balance,
    get_leave_requests,
    get_calendar_leaves,
    create_leave_request,
    update_leave_request_status,
    get_reimbursements,
    create_reimbursement,
    update_reimbursement_status,
    mark_reimbursement_paid,
    get_payslips,
    get_insurance_cover,
    get_company_policies,
    update_company_policy,
    get_company_holidays,
    add_company_holiday,
    bulk_add_company_holidays,
    delete_company_holiday,
    get_talent_of_the_month,
    cheer_talent,
    get_talent_nominations,
    create_talent_nomination,
    crown_new_talent,
    get_hall_of_flex,
    delete_talent,
    upload_document_to_storage,
    get_signed_document_url,
    upload_file_to_storage,
    get_signed_attachment_url
)
from models import (
    ProfileSelfUpdate,
    TeamMemberAdminUpdate,
    TeamMemberCreate,
    LeaveRequestCreate,
    LeaveDecision,
    ReimbursementClaimCreate,
    ClaimDecision,
    PolicyCreate,
    PolicyUpdate,
    TalentNominationCreate,
    TalentCrownCreate,
    HolidayCreate,
    HolidayBulkUpload
)

router = APIRouter(prefix="/hrms", tags=["flowwies-hrms"])


# =========================================================================
# 1. USER PROFILE & RBAC
# =========================================================================

@router.get("/me")
def get_my_hrms_profile(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = get_hrms_profile(client, user.id)
    if not res.data:
        prof_res = client.table("profiles").select("*").eq("id", user.id).execute()
        if prof_res.data and len(prof_res.data) > 0:
            p = prof_res.data[0]
        else:
            user_email = getattr(user, "email", "") or ""
            meta_name = getattr(user, "user_metadata", {}).get("full_name") if hasattr(user, "user_metadata") else None
            full_name = meta_name or (user_email.split("@")[0].capitalize() if "@" in user_email else "User")
            new_prof = {
                "id": user.id,
                "email": user_email,
                "full_name": full_name,
                "role_level": 0,
                "hrms_role": "employee",
                "department": "Tech",
                "can_access_crm": False
            }
            ins = client.table("profiles").insert(new_prof).execute()
            p = ins.data[0] if ins.data else new_prof
    else:
        p = res.data

    # Fetch departments from junction table profile_departments
    depts_res = client.table("profile_departments").select("departments(name)").eq("profile_id", user.id).execute()
    dept_names = [d["departments"]["name"] for d in depts_res.data if d.get("departments")] if depts_res.data else []
    if not dept_names:
        fallback_d = p.get("department") or "Tech"
        dept_names = ["Growth"] if "growth" in str(fallback_d).lower() else ["Tech"]

    is_manager = (
        (p.get("role_level") or 0) >= 1
        or (p.get("hrms_role") or "").lower() == "manager"
        or p.get("email", "").lower().startswith("manish")
        or p.get("email", "").lower().startswith("shilpa")
    )
    is_growth = any(d.lower() == "growth" for d in dept_names) or bool(p.get("can_access_crm")) or is_manager

    role_str = "manager" if is_manager else "employee"
    p["role"] = role_str
    p["hrms_role"] = role_str
    p["is_manager"] = is_manager
    p["is_admin"] = is_manager
    p["departments"] = dept_names
    p["can_access_crm"] = is_growth
    p["is_growth"] = is_growth
    p["must_change_password"] = bool(p.get("must_change_password", False))
    return p


@router.post("/me/change-password")
def record_password_changed(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    client.table("profiles").update({"must_change_password": False}).eq("id", user.id).execute()
    return {"status": "success", "must_change_password": False}


@router.patch("/me/profile")
def update_my_profile(body: ProfileSelfUpdate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return {"status": "noop"}

    # Employees cannot edit their email or mobile phone number
    prof = client.table("profiles").select("role_level, hrms_role").eq("id", user.id).execute()
    prof_data = prof.data[0] if (prof and prof.data) else {}
    user_email = (getattr(user, "email", "") or "").lower()
    is_mgr = (
        (prof_data.get("role_level") or 0) >= 1
        or (prof_data.get("hrms_role") or "").lower() == "manager"
        or user_email.startswith("manish")
        or user_email.startswith("shilpa")
    )
    if not is_mgr:
        update_data.pop("phone", None)
        update_data.pop("email", None)

    # Clean empty strings for date or uuid fields
    for k in ["dob"]:
        if k in update_data and (update_data[k] == "" or update_data[k] is None):
            update_data[k] = None

    try:
        res = update_hrms_profile(client, user.id, update_data)
        if not res.data:
            # Fallback: if user.id from auth.users does not match profile.id, match by user.email
            if hasattr(user, "email") and user.email:
                res = client.table("profiles").update(update_data).eq("email", user.email.lower().strip()).execute()
        if not res.data:
            raise HTTPException(status_code=400, detail="Profile update affected 0 rows. Please check if profile exists.")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database update failed: {str(e)}")


@router.get("/team")
def get_team(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = get_all_team_members(client)
    members = res.data or []

    # Map multiple departments from profile_departments
    all_pd = client.table("profile_departments").select("profile_id, departments(name)").execute().data or []
    pd_map = {}
    for row in all_pd:
        pid = row["profile_id"]
        dname = row.get("departments", {}).get("name") if row.get("departments") else None
        if dname:
            pd_map.setdefault(pid, []).append(dname)

    for m in members:
        pid = m["id"]
        depts = pd_map.get(pid, [])
        if not depts:
            fallback = m.get("department") or "Tech"
            depts = ["Growth"] if "growth" in str(fallback).lower() else ["Tech"]
        m["departments"] = list(set(depts))
        is_mgr = (
            (m.get("role_level") or 0) >= 1
            or (m.get("hrms_role") or "").lower() == "manager"
            or m.get("email", "").lower().startswith("manish")
            or m.get("email", "").lower().startswith("shilpa")
        )
        m["role"] = "manager" if is_mgr else "employee"
        m["hrms_role"] = m["role"]
        m["can_access_crm"] = any(d.lower() == "growth" for d in depts) or bool(m.get("can_access_crm")) or is_mgr

    return members


@router.patch("/team/{member_id}")
def update_member_by_manager(member_id: str, body: TeamMemberAdminUpdate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    update_data = {}

    target_role = body.role or body.hrms_role
    if target_role:
        clean_role = "manager" if target_role.lower() == "manager" else "employee"
        role_res = client.table("hrms_roles").select("id").eq("name", clean_role).execute()
        role_id = role_res.data[0]["id"] if role_res.data else None
        update_data["hrms_role"] = clean_role
        update_data["role_level"] = 1 if clean_role == "manager" else 0
        if role_id:
            update_data["role_id"] = role_id

    if body.departments is not None:
        sync_member_departments(client, member_id, body.departments)
        has_growth = any(d.lower() == "growth" for d in body.departments)
        update_data["can_access_crm"] = has_growth

    if body.manager_id is not None:
        update_data["manager_id"] = body.manager_id.strip() if (body.manager_id and body.manager_id.strip()) else None

    if body.can_access_crm is not None:
        update_data["can_access_crm"] = body.can_access_crm

    if body.is_active is not None:
        update_data["is_active"] = body.is_active

    # Full profile fields editable by manager
    for field in [
        "full_name", "email", "emp_code", "phone", "personal_email",
        "dob", "date_joined", "emergency_contact_name", "emergency_contact_phone",
        "address", "city", "state", "pin_code",
        "bank_account_holder", "bank_name", "bank_account_number",
        "ifsc_code", "upi_id"
    ]:
        val = getattr(body, field, None)
        if val is not None:
            # Clean empty strings for date and uuid fields to avoid Postgres syntax errors
            if field in ["dob", "date_joined", "manager_id"] and val == "":
                val = None
            update_data[field] = val

    if update_data:
        try:
            res = update_team_member_admin(client, member_id, update_data)
            if not res.data:
                # Fallback: if member_id didn't match id in profiles, try matching by email
                target_email = getattr(body, "email", None)
                if target_email:
                    res = client.table("profiles").update(update_data).eq("email", target_email.lower().strip()).execute()
            if not res.data:
                raise HTTPException(status_code=400, detail="Profile update affected 0 rows. Please verify member ID exists in profiles.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Database update failed: {str(e)}")

    return {"status": "updated", "data": update_data}


@router.post("/team")
def create_team_member(body: TeamMemberCreate, user=Depends(require_hrms_manager)):
    import uuid
    client = get_client_for_user(user.token)

    clean_email = body.email.strip().lower()
    clean_name = body.full_name.strip()
    clean_role = "manager" if body.role.lower() == "manager" else "employee"

    # Check if profile with this email already exists
    existing = client.table("profiles").select("id, email, full_name").eq("email", clean_email).execute()
    if existing.data and len(existing.data) > 0:
        member_id = existing.data[0]["id"]
        role_res = client.table("hrms_roles").select("id").eq("name", clean_role).execute()
        role_id = role_res.data[0]["id"] if role_res.data else None
        depts = body.departments or ["Tech"]
        sync_member_departments(client, member_id, depts)
        has_growth = any(d.lower() == "growth" for d in depts) or clean_role == "manager"

        upd = {
            "full_name": clean_name,
            "hrms_role": clean_role,
            "role_level": 1 if clean_role == "manager" else 0,
            "role_id": role_id,
            "manager_id": body.manager_id if body.manager_id else None,
            "can_access_crm": has_growth,
            "is_active": True
        }
        if body.dob:
            upd["dob"] = body.dob
        client.table("profiles").update(upd).eq("id", member_id).execute()
        return {"status": "updated", "id": member_id, "message": "Updated existing team member."}

    # Create new profile
    DEFAULT_PASSWORD = "workfloww@2026"
    from db.client import supabase_anon
    from services.email import send_welcome_credentials_email

    role_res = client.table("hrms_roles").select("id").eq("name", clean_role).execute()
    role_id = role_res.data[0]["id"] if role_res.data else None

    depts = body.departments or ["Tech"]
    primary_d = depts[0]
    sec_d = depts[1] if len(depts) > 1 else None
    dept_res = client.table("departments").select("id").eq("name", primary_d).execute()
    primary_dept_id = dept_res.data[0]["id"] if dept_res.data else None
    has_growth = any(d.lower() == "growth" for d in depts) or clean_role == "manager"

    # 1. Attempt creating in BOTH auth.users (Authentication) and public.profiles via RPC
    created_id = None
    try:
        rpc_res = client.rpc("create_team_user", {
            "new_email": clean_email,
            "new_full_name": clean_name,
            "new_role": clean_role,
            "new_department": primary_d,
            "new_password": DEFAULT_PASSWORD
        }).execute()
        if rpc_res.data:
            created_id = str(rpc_res.data)
            print(f"✓ Created user in Auth & Profiles via create_team_user RPC: {clean_email} -> {created_id}")
            extra_upd = {}
            if body.dob:
                extra_upd["dob"] = body.dob
            if body.manager_id:
                extra_upd["manager_id"] = body.manager_id
            if role_id:
                extra_upd["role_id"] = role_id
            if primary_dept_id:
                extra_upd["primary_department_id"] = primary_dept_id
            if extra_upd:
                client.table("profiles").update(extra_upd).eq("id", created_id).execute()
    except Exception as rpc_err:
        print("Notice on create_team_user RPC:", rpc_err)

    # 2. Fallback to direct insertion if RPC was not created yet
    if not created_id:
        auth_id = None
        if supabase_anon and hasattr(supabase_anon, "auth"):
            try:
                auth_res = supabase_anon.auth.sign_up({
                    "email": clean_email,
                    "password": DEFAULT_PASSWORD,
                    "options": {
                        "data": {
                            "full_name": clean_name
                        }
                    }
                })
                if auth_res and auth_res.user and auth_res.user.id:
                    auth_id = str(auth_res.user.id)
                    print(f"✓ Created Supabase Auth user: {clean_email} -> {auth_id}")
            except Exception as auth_err:
                print("Notice on auth sign_up:", auth_err)

        new_id = auth_id or str(uuid.uuid4())
        new_prof = {
            "id": new_id,
            "full_name": clean_name,
            "email": clean_email,
            "role_level": 1 if clean_role == "manager" else 0,
            "hrms_role": clean_role,
            "role_id": role_id,
            "department": primary_d,
            "secondary_department": sec_d,
            "primary_department_id": primary_dept_id,
            "manager_id": body.manager_id if body.manager_id else None,
            "can_access_crm": has_growth,
            "is_active": True,
            "must_change_password": True
        }
        if body.dob:
            new_prof["dob"] = body.dob

        try:
            ins = client.table("profiles").insert(new_prof).execute()
            created_id = ins.data[0]["id"] if ins.data else new_id
        except Exception as e:
            err_msg = str(e)
            if "company_department" in err_msg or "22P02" in err_msg:
                try:
                    new_prof["department"] = primary_d.lower()
                    ins = client.table("profiles").insert(new_prof).execute()
                    created_id = ins.data[0]["id"] if ins.data else new_id
                except Exception:
                    try:
                        new_prof.pop("department", None)
                        new_prof.pop("secondary_department", None)
                        ins = client.table("profiles").insert(new_prof).execute()
                        created_id = ins.data[0]["id"] if ins.data else new_id
                    except Exception as final_e:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to create profile: {str(final_e)}. Please run migration 007_fix_hrms_rls_policies.sql in Supabase SQL editor."
                        )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create profile: {err_msg}. Please run migration 007_fix_hrms_rls_policies.sql in Supabase SQL editor."
                )

    # Sync profile_departments
    sync_member_departments(client, created_id, depts)

    # Create default leave balances
    try:
        from datetime import datetime, timezone
        cur_year = datetime.now(timezone.utc).year
        client.table("leave_balances").insert({
            "user_id": created_id,
            "year": cur_year,
            "casual_days": float(body.casual_days if body.casual_days is not None else 2),
            "sick_days": float(body.sick_days if body.sick_days is not None else 0),
            "earned_days": float(body.earned_days if body.earned_days is not None else 0)
        }).execute()
    except Exception as e:
        print("Warning: initializing leave balance failed:", e)

    # Dispatch welcome email with credentials
    try:
        send_welcome_credentials_email(
            to_email=clean_email,
            full_name=clean_name,
            default_password=DEFAULT_PASSWORD
        )
    except Exception as mail_err:
        print("Notice: email sending error:", mail_err)

    return {
        "status": "created",
        "id": created_id,
        "message": f"Team member created! Login credentials sent to {clean_email} (Default password: {DEFAULT_PASSWORD})."
    }



# =========================================================================
# 2. LEAVE MANAGEMENT
# =========================================================================

@router.get("/leave/summary")
def get_leave_summary(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    today = datetime.now(timezone.utc)
    current_month_str = today.strftime("%Y-%m")

    # Fetch user's leave requests to compute monthly 2-day quota
    requests = get_leave_requests(client, user_id=user.id).data or []
    taken_this_month = 0.0
    pending_count = 0

    for r in requests:
        st = (r.get("status") or "").strip().lower()
        if st == "pending":
            pending_count += 1
        elif st == "approved":
            # Exclude birthday leave if any
            l_type = (r.get("leave_type") or "").strip().lower()
            if l_type != "birthday":
                s_date = str(r.get("start_date") or "")[:7]
                e_date = str(r.get("end_date") or "")[:7]
                if s_date == current_month_str or e_date == current_month_str:
                    taken_this_month += float(r.get("days_count", 0) or 0)

    monthly_allowance = 2.0
    remaining_this_month = max(0.0, monthly_allowance - taken_this_month)

    # Next upcoming holiday or employee birthday
    today_str = today.strftime("%Y-%m-%d")
    holidays = get_company_holidays(client).data or []
    upcoming_events = []

    for h in holidays:
        if h.get("holiday_date") >= today_str:
            d1 = datetime.strptime(today_str, "%Y-%m-%d")
            d2 = datetime.strptime(h.get("holiday_date"), "%Y-%m-%d")
            upcoming_events.append({
                "name": h.get("name"),
                "date": h.get("holiday_date"),
                "days_away": (d2 - d1).days,
                "type": "holiday"
            })

    # Also check employee birthdays for next celebration / leave
    profs = client.table("profiles").select("id, full_name, dob, is_active").execute().data or []
    cur_year = today.year
    for p in profs:
        if p.get("is_active") is False or not p.get("dob"):
            continue
        try:
            dob_parts = p["dob"].split("-")
            b_m = int(dob_parts[1]) if len(dob_parts) >= 3 else int(dob_parts[0])
            b_d = int(dob_parts[2]) if len(dob_parts) >= 3 else int(dob_parts[1])

            for y in (cur_year, cur_year + 1):
                b_str = f"{y}-{b_m:02d}-{b_d:02d}"
                if b_str >= today_str:
                    d1 = datetime.strptime(today_str, "%Y-%m-%d")
                    d2 = datetime.strptime(b_str, "%Y-%m-%d")
                    upcoming_events.append({
                        "name": f"🎂 {p['full_name']}'s Birthday",
                        "date": b_str,
                        "days_away": (d2 - d1).days,
                        "type": "birthday"
                    })
                    break
        except Exception:
            pass

    upcoming_events.sort(key=lambda x: x["days_away"])
    next_holiday = upcoming_events[0] if upcoming_events else None

    return {
        "monthly_allowance": monthly_allowance,
        "taken_this_month": taken_this_month,
        "used_this_month": taken_this_month,
        "remaining_this_month": remaining_this_month,
        "month_name": today.strftime("%B %Y"),
        "pending_count": pending_count,
        "next_holiday": next_holiday,
        # Keep backward compatibility balance object
        "balance": {
            "casual_days": remaining_this_month,
            "sick_days": 0.0,
            "earned_days": 0.0,
            "monthly_quota": monthly_allowance,
            "remaining": remaining_this_month,
            "remaining_this_month": remaining_this_month,
            "used_this_month": taken_this_month,
            "taken_this_month": taken_this_month
        }
    }


@router.get("/leave/calendar")
def get_calendar(start_date: str = Query(...), end_date: str = Query(...), user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    leaves = get_calendar_leaves(client, start_date, end_date).data or []
    holidays = get_company_holidays(client).data or []

    # Map leaves with visibility filter:
    me = get_hrms_profile(client, user.id).data or {}
    is_admin = (me.get("role_level") or 0) >= 1 or (me.get("hrms_role") or "").lower() in ("admin", "manager")
    is_mgr = is_admin or (me.get("hrms_role") or "").lower() == "manager"

    visible_leaves = []
    for l in leaves:
        if l.get("status") == "approved":
            visible_leaves.append(l)
        elif l.get("status") == "pending":
            if l.get("user_id") == user.id or is_mgr:
                visible_leaves.append(l)

    # Automatically generate Birthday Leaves for employees on their birthdays!
    # "on that birthday that employees stay on leave"
    profs = client.table("profiles").select("id, full_name, dob, department, avatar_color, is_active").execute().data or []
    start_year = int(start_date.split("-")[0])
    end_year = int(end_date.split("-")[0])
    years_to_check = set([start_year, end_year])

    birthdays_list = []
    for p in profs:
        if p.get("is_active") is False or not p.get("dob"):
            continue
        try:
            parts = p["dob"].split("-")
            b_m = int(parts[1]) if len(parts) >= 3 else int(parts[0])
            b_d = int(parts[2]) if len(parts) >= 3 else int(parts[1])

            for y in years_to_check:
                bday_str = f"{y}-{b_m:02d}-{b_d:02d}"
                if start_date <= bday_str <= end_date:
                    bday_item = {
                        "id": f"bday-{p['id']}-{y}-{b_m}-{b_d}",
                        "user_id": p["id"],
                        "leave_type": "Birthday",
                        "start_date": bday_str,
                        "end_date": bday_str,
                        "days_count": 1.0,
                        "reason": f"🎂 {p['full_name']}'s Birthday! (Official Birthday Leave)",
                        "status": "approved",
                        "is_birthday": True,
                        "profiles": {
                            "full_name": p["full_name"],
                            "department": p.get("department") or "Tech",
                            "avatar_color": p.get("avatar_color") or "var(--vt2)"
                        }
                    }
                    visible_leaves.append(bday_item)
                    birthdays_list.append({
                        "user_id": p["id"],
                        "full_name": p["full_name"],
                        "date": bday_str,
                        "month_day": f"{b_m:02d}-{b_d:02d}"
                    })
        except Exception as e:
            print("Error parsing birthday for calendar:", p.get("id"), e)

    return {
        "leaves": visible_leaves,
        "holidays": holidays,
        "birthdays": birthdays_list
    }


@router.get("/leave/requests")
def list_my_leave_requests(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    return get_leave_requests(client, user_id=user.id).data or []


@router.get("/leave/approvals")
def list_pending_leave_approvals(user=Depends(require_hrms_manager_or_admin)):
    client = get_client_for_user(user.token)
    all_leaves = get_leave_requests(client).data or []
    me = get_hrms_profile(client, user.id).data or {}
    is_admin = (me.get("role_level") or 0) >= 1 or (me.get("hrms_role") or "").lower() in ("admin", "manager")

    pending = []
    for r in all_leaves:
        if r.get("status") != "pending" or r.get("user_id") == user.id:
            continue
        if is_admin:
            pending.append(r)
        else:
            emp_prof = client.table("profiles").select("manager_id").eq("id", r.get("user_id")).single().execute()
            if emp_prof.data and emp_prof.data.get("manager_id") == user.id:
                pending.append(r)

    return pending


@router.post("/leave/request")
def apply_leave(body: LeaveRequestCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    start_dt = datetime.strptime(body.start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(body.end_date, "%Y-%m-%d")
    if end_dt < start_dt:
        raise HTTPException(status_code=400, detail="End date cannot be earlier than start date")

    days_count = (end_dt - start_dt).days + 1

    # Rule: 2 leaves per month, renews every month
    req_month_str = start_dt.strftime("%Y-%m")
    existing_reqs = client.table("leave_requests").select("*").eq("user_id", user.id).execute().data or []

    taken_in_target_month = 0.0
    for r in existing_reqs:
        if r.get("status") in ("approved", "pending"):
            if r.get("leave_type") != "Birthday":
                if r.get("start_date", "").startswith(req_month_str):
                    taken_in_target_month += float(r.get("days_count", 0) or 0)

    monthly_allowance = 2.0
    available = max(0.0, monthly_allowance - taken_in_target_month)

    if days_count > available:
        raise HTTPException(
            status_code=400,
            detail=f"Every employee gets 2 leaves per month (renews every month). You have {available:.1f} leave(s) available for {start_dt.strftime('%B %Y')}. Requested: {days_count} day(s)."
        )

    leave_data = {
        "user_id": user.id,
        "leave_type": body.leave_type or "Monthly",
        "start_date": body.start_date,
        "end_date": body.end_date,
        "days_count": days_count,
        "reason": body.reason,
        "status": "pending"
    }

    try:
        res = create_leave_request(client, leave_data)
        return res.data[0] if res.data else {"status": "created"}
    except Exception as e:
        # Fallback to 'Casual' if enum constraint is still in effect
        if "hrms_leave_type" in str(e):
            leave_data["leave_type"] = "Casual"
            res = create_leave_request(client, leave_data)
            return res.data[0] if res.data else {"status": "created"}
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/leave/{req_id}/decision")
def decide_leave(req_id: str, body: LeaveDecision, user=Depends(require_hrms_manager_or_admin)):
    client = get_client_for_user(user.token)
    req = client.table("leave_requests").select("*").eq("id", req_id).single().execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Leave request not found")

    row = req.data
    if row.get("status") != "pending":
        raise HTTPException(status_code=400, detail="This leave request is already finalized")

    status = body.status.lower()
    if status not in ("approved", "declined"):
        raise HTTPException(status_code=400, detail="Status must be approved or declined")

    res = update_leave_request_status(client, req_id, status, user.id)

    # When approved, also update leave_balances table for the applicant
    if status == "approved":
        applicant_id = row.get("user_id")
        days = float(row.get("days_count", 0) or 1)
        cur_year = datetime.now(timezone.utc).year
        try:
            lb_res = client.table("leave_balances").select("*").eq("user_id", applicant_id).eq("year", cur_year).execute()
            if lb_res.data:
                curr_casual = float(lb_res.data[0].get("casual_days", 2.0) or 0)
                new_casual = max(0.0, curr_casual - days)
                client.table("leave_balances").update({"casual_days": new_casual}).eq("id", lb_res.data[0]["id"]).execute()
        except Exception as lb_err:
            print("Notice on updating leave_balances:", lb_err)

    return res.data[0] if res.data else {"status": status}


# =========================================================================
# HOLIDAY CALENDAR MANAGEMENT (MANAGER ONLY)
# =========================================================================

@router.get("/holidays")
def list_holidays(year: Optional[int] = None, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    return get_company_holidays(client, year=year).data or []


@router.post("/holidays")
def add_holiday(body: HolidayCreate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    res = add_company_holiday(client, body.name.strip(), body.holiday_date, body.year)
    return {"status": "created", "holiday": res.data[0] if res.data else {"name": body.name, "holiday_date": body.holiday_date}}


@router.post("/holidays/upload")
def upload_holiday_calendar(body: HolidayBulkUpload, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    items = [{"name": h.name.strip(), "holiday_date": h.holiday_date, "year": h.year} for h in body.holidays]
    if not items:
        raise HTTPException(status_code=400, detail="No holidays provided in payload")
    res = bulk_add_company_holidays(client, items)
    return {"status": "uploaded", "count": len(items)}


@router.delete("/holidays/{holiday_id}")
def remove_holiday(holiday_id: str, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    delete_company_holiday(client, holiday_id)
    return {"status": "deleted"}


@router.post("/leave/{req_id}/withdraw")
def withdraw_leave(req_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    req = client.table("leave_requests").select("*").eq("id", req_id).eq("user_id", user.id).single().execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Leave request not found or not owned by you")

    if req.data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be withdrawn")

    client.table("leave_requests").delete().eq("id", req_id).execute()
    return {"status": "withdrawn"}


# =========================================================================
# 3. REIMBURSEMENT CLAIMS
# =========================================================================

@router.get("/reimbursements")
def list_my_reimbursements(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    return get_reimbursements(client, user_id=user.id).data or []


@router.get("/reimbursements/approvals")
def list_reimbursement_approvals(user=Depends(require_hrms_manager_or_admin)):
    client = get_client_for_user(user.token)
    claims = get_reimbursements(client).data or []
    me = get_hrms_profile(client, user.id).data or {}
    my_name = (me.get("full_name") or "").lower()
    my_email = (me.get("email") or "").lower()
    is_admin = (me.get("role_level") or 0) >= 1 or (me.get("hrms_role") or "").lower() in ("admin", "manager")

    waiting = []
    for c in claims:
        if c.get("user_id") == user.id:
            continue
        c_status = c.get("status")
        target_mgr = (c.get("target_manager") or "both").lower()

        # Check manager routing
        matches_manager = False
        if "both" in target_mgr:
            matches_manager = True
        elif my_name and (my_name in target_mgr or any(part in target_mgr for part in my_name.split() if len(part) > 2)):
            matches_manager = True
        elif "shilpa" in target_mgr and "shilpa" in my_email:
            matches_manager = True
        elif "manish" in target_mgr and "manish" in my_email:
            matches_manager = True

        if is_admin:
            if c_status == "pending" and matches_manager:
                waiting.append(c)
            elif c_status == "approved":
                waiting.append(c)
        else:
            if c_status == "pending" and matches_manager:
                waiting.append(c)

    return waiting


@router.post("/reimbursements/upload-receipt")
def upload_reimbursement_receipt(file: UploadFile = File(...), user=Depends(get_current_user)):
    import uuid
    import re
    client = get_client_for_user(user.token)
    file_bytes = file.file.read()
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")

    clean_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or "receipt")
    storage_path = f"reimbursements/{user.id}/{uuid.uuid4()}_{clean_filename}"

    # Try documents bucket, or fallback to lead-attachments bucket
    try:
        upload_document_to_storage(client, storage_path, file_bytes, file.content_type or "application/octet-stream")
    except Exception:
        try:
            upload_file_to_storage(client, storage_path, file_bytes, file.content_type or "application/octet-stream")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload receipt file: {str(e)}")

    is_img = bool(file.content_type and file.content_type.startswith("image/")) or bool(
        re.search(r"\.(jpg|jpeg|png|webp|gif)$", clean_filename, re.I)
    )
    return {
        "receipt_file_name": file.filename,
        "receipt_storage_path": storage_path,
        "is_image": is_img
    }


@router.get("/reimbursements/{claim_id}/receipt")
def get_reimbursement_receipt(claim_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    claim = client.table("reimbursement_claims").select("*").eq("id", claim_id).single().execute()
    if not claim.data:
        raise HTTPException(status_code=404, detail="Claim not found")

    storage_path = claim.data.get("receipt_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="No receipt stored for this claim")

    try:
        signed_url = get_signed_document_url(client, storage_path, expires_in=3600)
    except Exception:
        signed_url = get_signed_attachment_url(client, storage_path, expires_in=3600)

    url_str = signed_url if isinstance(signed_url, str) else signed_url.get("signedURL", signed_url)
    return {"url": url_str}


@router.post("/reimbursements")
def submit_reimbursement(body: ReimbursementClaimCreate, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    target_mgr = body.target_manager or "Both"
    claim_data = {
        "user_id": user.id,
        "title": body.title,
        "amount": body.amount,
        "receipt_storage_path": body.receipt_storage_path,
        "receipt_file_name": body.receipt_file_name,
        "is_image": body.is_image,
        "target_manager": target_mgr,
        "status": "pending"
    }
    try:
        res = create_reimbursement(client, claim_data)
    except Exception as e:
        # Graceful fallback if target_manager column hasn't been added to DB yet
        if "target_manager" in str(e).lower() or "schema cache" in str(e).lower():
            claim_data.pop("target_manager", None)
            res = create_reimbursement(client, claim_data)
        else:
            raise
    return res.data[0] if res.data else {"status": "submitted"}


@router.post("/reimbursements/{claim_id}/decision")
def decide_claim(claim_id: str, body: ClaimDecision, user=Depends(require_hrms_manager_or_admin)):
    client = get_client_for_user(user.token)
    claim = client.table("reimbursement_claims").select("*").eq("id", claim_id).single().execute()
    if not claim.data:
        raise HTTPException(status_code=404, detail="Claim not found")

    status = body.status.lower()
    if status not in ("approved", "declined"):
        raise HTTPException(status_code=400, detail="Status must be approved or declined")

    res = update_reimbursement_status(client, claim_id, status, user.id)
    return res.data[0] if res.data else {"status": status}


@router.post("/reimbursements/{claim_id}/pay")
def pay_claim(claim_id: str, user=Depends(require_hrms_admin)):
    client = get_client_for_user(user.token)
    res = mark_reimbursement_paid(client, claim_id, user.id)
    return res.data[0] if res.data else {"status": "paid"}


@router.post("/reimbursements/{claim_id}/withdraw")
def withdraw_claim(claim_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    claim = client.table("reimbursement_claims").select("*").eq("id", claim_id).eq("user_id", user.id).single().execute()
    if not claim.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending claims can be withdrawn")

    client.table("reimbursement_claims").delete().eq("id", claim_id).execute()
    return {"status": "withdrawn"}


# =========================================================================
# 4. PAYSLIPS & INSURANCE
# =========================================================================

@router.get("/payslips")
def list_payslips(user_id: Optional[str] = None, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    me = get_hrms_profile(client, user.id).data or {}
    is_admin = (me.get("role_level") or 0) >= 1 or (me.get("hrms_role") or "").lower() in ("admin", "manager")

    # Only admins can view someone else's payslips
    target_id = user.id
    if user_id and is_admin:
        target_id = user_id

    return get_payslips(client, user_id=target_id).data or []


@router.get("/insurance")
def get_insurance(user_id: Optional[str] = None, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    me = get_hrms_profile(client, user.id).data or {}
    is_admin = (me.get("role_level") or 0) >= 1 or (me.get("hrms_role") or "").lower() in ("admin", "manager")

    target_id = user.id
    if user_id and is_admin:
        target_id = user_id

    res = get_insurance_cover(client, target_id)
    return res.data[0] if res.data and len(res.data) > 0 else {
        "policy_number": "GMC-PENDING",
        "cover_amount": "₹5,00,000",
        "dependents": "Self"
    }


# =========================================================================
# 5. POLICIES & TALENT
# =========================================================================

@router.get("/policies")
def list_policies(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    return get_company_policies(client).data or []


@router.post("/policies")
def create_policy(body: PolicyCreate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    data = {
        "title": body.title.strip(),
        "punchline": (body.punchline or body.title).strip(),
        "body": body.body.strip(),
        "sort_order": body.sort_order or 0,
        "updated_by": user.id,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    res = client.table("company_policies").insert(data).execute()
    return res.data[0] if res.data else {"status": "created"}


@router.patch("/policies/{policy_id}")
def edit_policy(policy_id: str, body: PolicyUpdate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    upd = {
        "body": body.body,
        "updated_by": user.id,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if body.title:
        upd["title"] = body.title.strip()
    if body.punchline:
        upd["punchline"] = body.punchline.strip()
    res = client.table("company_policies").update(upd).eq("id", policy_id).execute()
    return res.data[0] if res.data else {"status": "updated"}


@router.delete("/policies/{policy_id}")
def delete_policy(policy_id: str, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    client.table("company_policies").delete().eq("id", policy_id).execute()
    return {"status": "deleted"}


@router.get("/talent")
def get_talent_overview(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    current_talent_res = get_talent_of_the_month(client)
    current_talent = current_talent_res.data[0] if current_talent_res.data else None
    nominations = get_talent_nominations(client).data or []
    wall = get_hall_of_flex(client).data or []
    all_crowned = client.table("talent_of_the_month").select(
        "id, month_year, why_text, cheers_count, is_current, created_at, profiles:profiles!talent_of_the_month_user_id_fkey(full_name, department, avatar_color)"
    ).order("created_at", desc=True).execute().data or []

    MONTH_NAMES = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december"
    ]

    def parse_month_year_sort(item):
        my_str = item.get("month_year", "") if isinstance(item, dict) else ""
        if not my_str:
            return (9999, 99)
        parts = my_str.strip().split()
        if len(parts) >= 2:
            m_str = parts[0].lower()
            try:
                year = int(parts[1])
            except ValueError:
                year = 9999
            for idx, name in enumerate(MONTH_NAMES):
                if name.startswith(m_str[:3]):
                    return (year, idx)
        return (9999, 99)

    wall.sort(key=parse_month_year_sort)

    return {
        "current": current_talent,
        "nominations": nominations,
        "wall": wall,
        "all_crowned": all_crowned
    }


@router.post("/talent/nominate")
def nominate_talent(body: TalentNominationCreate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    if body.nominee_id == user.id:
        raise HTTPException(status_code=400, detail="Self nominations are not allowed")

    data = {
        "nominee_id": body.nominee_id,
        "nominated_by": user.id,
        "why_text": body.why_text
    }
    res = create_talent_nomination(client, data)
    return res.data[0] if res.data else {"status": "nominated"}


@router.post("/talent/{talent_id}/cheer")
def cheer_current_talent(talent_id: str, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = cheer_talent(client, talent_id)
    return res.data[0] if res.data else {"status": "cheered"}


@router.post("/talent/crown")
def crown_talent(body: TalentCrownCreate, user=Depends(require_hrms_admin)):
    client = get_client_for_user(user.token)
    res = crown_new_talent(
        client,
        body.user_id,
        body.month_year,
        body.why_text,
        user.id,
        nomination_id=body.nomination_id
    )
    return res.data[0] if res.data else {"status": "crowned"}


@router.delete("/talent/{talent_id}")
def remove_talent(talent_id: str, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    res = delete_talent(client, talent_id)
    return {"status": "deleted", "id": talent_id}
