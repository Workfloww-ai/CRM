


LEAD_COLUMNS = (
    "id, first_name, last_name, title, org, email, phone, phone_2, "
    "linkedin, location, industry, function, revenue, currency, status, "
    "next_action, next_action_assignee, due_date, created_at, updated_at, deleted_at"
)
PROFILE_COLUMNS = "id, full_name, email, role_level, created_at"
ACTIVITY_COLUMNS = "id, lead_id, user_id, type, content, metadata, created_at"
ATTACHMENT_COLUMNS = "id, lead_id, file_name, storage_path, uploaded_by, created_at"


def get_all_leads(client):
    return client.table("leads").select(LEAD_COLUMNS).is_("deleted_at", "null").execute()


def get_leads_page(client, page=1, page_size=20, search=None, name=None, org=None,
                    title=None, location=None, industry=None, function=None, sort_by="created_at", sort_desc=True, assignee_id=None):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("leads").select(
        f"{LEAD_COLUMNS}, lead_activities(created_at, profiles(full_name))", count="exact"
    )
    query = query.is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="lead_activities", desc=True).limit(1, foreign_table="lead_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",org.ilike."{p}",title.ilike."{p}",location.ilike."{p}",industry.ilike."{p}"')
    if name:
        p = f'%{name.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}"')
    if org:
        query = query.ilike("org", f"%{org}%")
    if title:
        query = query.ilike("title", f"%{title}%")
    if location:
        query = query.ilike("location", f"%{location}%")
    if industry:
        query = query.ilike("industry", f"%{industry}%")
    if function:
        query = query.ilike("function", f"%{function}%")
    if assignee_id:
        query = query.eq("next_action_assignee", assignee_id)

    if sort_by == "created_at":
        query = query.order("due_date", desc=False, nullsfirst=False)
        query = query.order("next_action_assignee", desc=False, nullsfirst=False)
        query = query.order("next_action", desc=False, nullsfirst=False)
    
    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    return query.execute()


def create_lead(client, lead_data: dict):
    return client.table("leads").insert(lead_data).execute()


def update_lead(client, lead_id: str, update_data: dict):
    return client.table("leads").update(update_data).eq("id", lead_id).execute()


def get_lead_status(client, lead_id: str):
    return client.table("leads").select("status").eq("id", lead_id).single().execute()


def delete_lead(client, lead_id: str):
    from datetime import datetime, timezone
    return client.table("leads").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", lead_id).execute()


def get_profile(client, user_id: str):
    return client.table("profiles").select(PROFILE_COLUMNS).eq("id", user_id).single().execute()


def get_profile_role(client, user_id: str):
    return client.table("profiles").select("role_level").eq("id", user_id).single().execute()


def create_activity(client, activity_data: dict):
    return client.table("lead_activities").insert(activity_data).execute()


def get_lead_activities(client, lead_id: str):
    return client.table("lead_activities").select(f"{ACTIVITY_COLUMNS}, profiles(full_name)").eq("lead_id", lead_id).order("created_at", desc=True).execute()


def create_attachment_record(client, attachment_data: dict):
    return client.table("attachments").insert(attachment_data).execute()


def get_lead_attachments(client, lead_id: str):
    return client.table("attachments").select(f"{ATTACHMENT_COLUMNS}, profiles(full_name)").eq("lead_id", lead_id).order("created_at", desc=True).execute()


def get_attachment(client, attachment_id: str):
    return client.table("attachments").select(ATTACHMENT_COLUMNS).eq("id", attachment_id).single().execute()


def delete_attachment_record(client, attachment_id: str):
    return client.table("attachments").delete().eq("id", attachment_id).execute()


# Storage now uses the user-scoped client
def upload_file_to_storage(client, storage_path: str, file_bytes: bytes, content_type: str):
    return client.storage.from_("lead-attachments").upload(storage_path, file_bytes, {"content-type": content_type})


def get_signed_attachment_url(client, storage_path: str, expires_in: int = 60, download: str = None):
    options = {}
    if download:
        options["download"] = download
    return client.storage.from_("lead-attachments").create_signed_url(storage_path, expires_in, options=options)


def delete_file_from_storage(client, storage_path: str):
    return client.storage.from_("lead-attachments").remove([storage_path])

def get_company_reports(client, company_name: str):
    return (
        client.table("company_reports")
        .select("id, company_name, status, storage_path, error_message, created_at, completed_at")
        .eq("company_name", company_name)
        .order("created_at", desc=True)
        .execute()
    )


def get_company_report(client, report_id: str):
    return (
        client.table("company_reports")
        .select("id, company_name, status, storage_path, error_message")
        .eq("id", report_id)
        .single()
        .execute()
    )


def create_company_report(client, company_name: str, requested_by: str):
    return (
        client.table("company_reports")
        .insert({"company_name": company_name, "requested_by": requested_by, "status": "pending"})
        .execute()
    )


# --- Investors ---

INVESTOR_COLUMNS = (
    "id, first_name, last_name, title, email, phone, phone_2, company, industry, "
    "function, linkedin, location, revenue, currency, status, next_action, due_date, "
    "created_at, updated_at, deleted_at"
)

def get_all_investors(client):
    return client.table('investors').select(INVESTOR_COLUMNS).is_('deleted_at', 'null').execute()

def get_investors_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("investors").select(f"{INVESTOR_COLUMNS}, investor_activities(created_at, profiles(full_name))", count="exact").is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="investor_activities", desc=True).limit(1, foreign_table="investor_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",company.ilike."{p}"')

    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    return query.execute()

def create_investor(client, data: dict):
    return client.table("investors").insert(data).execute()

def update_investor(client, id: str, data: dict):
    return client.table("investors").update(data).eq("id", id).execute()

def delete_investor(client, id: str):
    from datetime import datetime, timezone
    return client.table("investors").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", id).execute()


# --- Fractional Leaders ---

FRACTIONAL_LEADER_COLUMNS = (
    "id, first_name, last_name, title, email, phone, phone_2, domain, industry, "
    "function, linkedin, location, revenue, currency, status, next_action, next_action_assignee, due_date, "
    "created_at, updated_at, deleted_at"
)

def get_all_fractional_leaders(client):
    return client.table('fractional_leaders').select(FRACTIONAL_LEADER_COLUMNS).is_('deleted_at', 'null').execute()

def get_fractional_leaders_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True, assignee_id=None):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("fractional_leaders").select(
        f"{FRACTIONAL_LEADER_COLUMNS}, fractional_leader_activities(created_at, profiles(full_name))", count="exact"
    ).is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="fractional_leader_activities", desc=True).limit(1, foreign_table="fractional_leader_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",domain.ilike."{p}"')
    if assignee_id:
        query = query.eq("next_action_assignee", assignee_id)

    if sort_by == "created_at":
        query = query.order("due_date", desc=False, nullsfirst=False)
        query = query.order("next_action_assignee", desc=False, nullsfirst=False)
        query = query.order("next_action", desc=False, nullsfirst=False)

    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    return query.execute()

def create_fractional_leader(client, data: dict):
    return client.table("fractional_leaders").insert(data).execute()

def update_fractional_leader(client, id: str, data: dict):
    return client.table("fractional_leaders").update(data).eq("id", id).execute()

def delete_fractional_leader(client, id: str):
    from datetime import datetime, timezone
    return client.table("fractional_leaders").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", id).execute()


# --- Training Partners ---

TRAINING_PARTNER_COLUMNS = (
    "id, first_name, last_name, title, email, phone, phone_2, organization, industry, "
    "function, linkedin, location, revenue, currency, status, next_action, next_action_assignee, due_date, "
    "created_at, updated_at, deleted_at"
)

def get_all_training_partners(client):
    return client.table('training_partners').select(TRAINING_PARTNER_COLUMNS).is_('deleted_at', 'null').execute()

def get_training_partners_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True, assignee_id=None):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("training_partners").select(f"{TRAINING_PARTNER_COLUMNS}, training_partner_activities(created_at, profiles(full_name))", count="exact").is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="training_partner_activities", desc=True).limit(1, foreign_table="training_partner_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",organization.ilike."{p}"')
    if assignee_id:
        query = query.eq("next_action_assignee", assignee_id)

    if sort_by == "created_at":
        query = query.order("due_date", desc=False, nullsfirst=False)
        query = query.order("next_action_assignee", desc=False, nullsfirst=False)
        query = query.order("next_action", desc=False, nullsfirst=False)

    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    return query.execute()

def create_training_partner(client, data: dict):
    return client.table("training_partners").insert(data).execute()

def update_training_partner(client, id: str, data: dict):
    return client.table("training_partners").update(data).eq("id", id).execute()

def delete_training_partner(client, id: str):
    from datetime import datetime, timezone
    return client.table("training_partners").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", id).execute()
def get_fractional_leader_activities(client, leader_id: str):
    cols = ACTIVITY_COLUMNS.replace('lead_id', 'leader_id')
    return client.table("fractional_leader_activities").select(f"{cols}, profiles(full_name)").eq("leader_id", leader_id).order("created_at", desc=True).execute()

def create_fractional_leader_activity(client, activity_data: dict):
    return client.table("fractional_leader_activities").insert(activity_data).execute()


def get_investor_activities(client, investor_id: str):
    cols = ACTIVITY_COLUMNS.replace('lead_id', 'investor_id')
    return client.table("investor_activities").select(f"{cols}, profiles(full_name)").eq("investor_id", investor_id).order("created_at", desc=True).execute()

def create_investor_activity(client, activity_data: dict):
    return client.table("investor_activities").insert(activity_data).execute()

def get_training_partner_activities(client, training_partner_id: str):
    cols = ACTIVITY_COLUMNS.replace('lead_id', 'training_partner_id')
    return client.table("training_partner_activities").select(f"{cols}, profiles(full_name)").eq("training_partner_id", training_partner_id).order("created_at", desc=True).execute()

def create_training_partner_activity(client, activity_data: dict):
    return client.table("training_partner_activities").insert(activity_data).execute()

# --- Competitors ---

COMPETITOR_COLUMNS = "id, name, website, status, created_at, updated_at, deleted_at"

def get_all_competitors(client):
    return client.table('competitors').select(COMPETITOR_COLUMNS).is_('deleted_at', 'null').execute()

def get_competitors_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("competitors").select(f"{COMPETITOR_COLUMNS}, competitor_activities(created_at, profiles(full_name))", count="exact").is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="competitor_activities", desc=True).limit(1, foreign_table="competitor_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'name.ilike."{p}",website.ilike."{p}"')

    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    return query.execute()

def create_competitor(client, data: dict):
    return client.table("competitors").insert(data).execute()

def update_competitor(client, id: str, data: dict):
    return client.table("competitors").update(data).eq("id", id).execute()

def delete_competitor(client, id: str):
    from datetime import datetime, timezone
    return client.table("competitors").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", id).execute()

def get_competitor_activities(client, competitor_id: str):
    cols = ACTIVITY_COLUMNS.replace('lead_id', 'competitor_id')
    return client.table("competitor_activities").select(f"{cols}, profiles(full_name)").eq("competitor_id", competitor_id).order("created_at", desc=True).execute()

def create_competitor_activity(client, activity_data: dict):
    return client.table("competitor_activities").insert(activity_data).execute()

def upload_document_to_storage(client, storage_path: str, file_bytes: bytes, content_type: str):
    return client.storage.from_("documents").upload(storage_path, file_bytes, {"content-type": content_type})

def create_document_record(client, doc_data: dict):
    return client.table("documents").insert(doc_data).execute()

def get_documents_by_folder(client, folder: str):
    return client.table("documents").select("id, file_name, storage_path, folder, uploaded_by, created_at, profiles(full_name)").eq("folder", folder).is_("deleted_at", "null").order("created_at", desc=True).execute()

def get_document(client, doc_id: str):
    return client.table("documents").select("*").eq("id", doc_id).single().execute()

def get_signed_document_url(client, storage_path: str, expires_in: int = 3600, download: str = None):
    options = {}
    if download:
        options["download"] = download
    return client.storage.from_("documents").create_signed_url(storage_path, expires_in, options=options)

def delete_document_from_storage(client, storage_path: str):
    return client.storage.from_("documents").remove([storage_path])

def delete_document_record(client, doc_id: str):
    return client.table("documents").delete().eq("id", doc_id).execute()


# =========================================================================
# FLOWWIES HRMS QUERIES
# =========================================================================

HRMS_PROFILE_COLUMNS = (
    "id, full_name, email, role_level, hrms_role, role_id, department, secondary_department, "
    "primary_department_id, can_access_crm, manager_id, is_active, emp_code, avatar_color, dob, date_joined, "
    "phone, personal_email, emergency_contact_name, emergency_contact_phone, "
    "address, city, state, pin_code, bank_account_holder, bank_name, bank_account_number, "
    "ifsc_code, upi_id, created_at"
)

def get_hrms_profile(client, user_id: str):
    return client.table("profiles").select(HRMS_PROFILE_COLUMNS).eq("id", user_id).single().execute()

def update_hrms_profile(client, user_id: str, data: dict):
    return client.table("profiles").update(data).eq("id", user_id).execute()

def get_all_team_members(client):
    return client.table("profiles").select(HRMS_PROFILE_COLUMNS).order("full_name").execute()

def update_team_member_admin(client, user_id: str, data: dict):
    return client.table("profiles").update(data).eq("id", user_id).execute()

def get_hrms_roles(client):
    return client.table("hrms_roles").select("*").order("name").execute()

def get_departments(client):
    return client.table("departments").select("*").order("name").execute()

def get_member_departments(client, user_id: str):
    return client.table("profile_departments").select("department_id, departments(id, name)").eq("profile_id", user_id).execute()

def sync_member_departments(client, user_id: str, dept_names: list):
    dept_rows = client.table("departments").select("id, name").in_("name", dept_names).execute().data or []
    if not dept_rows:
        return
    # Delete existing mappings
    try:
        client.table("profile_departments").delete().eq("profile_id", user_id).execute()
    except Exception as e:
        print("Warning: deleting profile_departments mapping failed:", e)

    # Insert new mappings
    new_entries = [{"profile_id": user_id, "department_id": d["id"]} for d in dept_rows]
    try:
        client.table("profile_departments").insert(new_entries).execute()
    except Exception as e:
        print("Warning: inserting into profile_departments failed (check RLS policy 007):", e)

    # Update primary_department_id and textual department on profile
    first_dept_id = dept_rows[0]["id"]
    primary_name = dept_rows[0]["name"]
    sec_name = dept_rows[1]["name"] if len(dept_rows) > 1 else None
    has_growth = any(d["name"].lower() == "growth" for d in dept_rows)
    try:
        client.table("profiles").update({
            "primary_department_id": first_dept_id,
            "department": primary_name,
            "secondary_department": sec_name,
            "can_access_crm": has_growth
        }).eq("id", user_id).execute()
    except Exception as e:
        if "company_department" in str(e) or "22P02" in str(e):
            try:
                client.table("profiles").update({
                    "primary_department_id": first_dept_id,
                    "department": primary_name.lower(),
                    "secondary_department": sec_name,
                    "can_access_crm": has_growth
                }).eq("id", user_id).execute()
            except Exception:
                try:
                    client.table("profiles").update({
                        "primary_department_id": first_dept_id,
                        "can_access_crm": has_growth
                    }).eq("id", user_id).execute()
                except Exception as inner_e:
                    print("Warning: fallback department update failed:", inner_e)
        else:
            print("Warning: updating profile department info failed:", e)


def get_leave_balance(client, user_id: str, year: int = None):
    from datetime import datetime, timezone
    if not year:
        year = datetime.now(timezone.utc).year
    res = client.table("leave_balances").select("*").eq("user_id", user_id).eq("year", year).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    # Initialize default balance if not created
    new_bal = {"user_id": user_id, "year": year, "casual_days": 8.0, "sick_days": 6.0, "earned_days": 12.0}
    ins = client.table("leave_balances").insert(new_bal).execute()
    return ins.data[0] if ins.data else new_bal

def deduct_leave_balance(client, user_id: str, year: int, leave_type: str, days: float):
    bal = get_leave_balance(client, user_id, year)
    col = f"{leave_type.lower()}_days"
    current = float(bal.get(col, 0) or 0)
    updated = max(0.0, current - float(days))
    return client.table("leave_balances").update({col: updated}).eq("user_id", user_id).eq("year", year).execute()

def get_leave_requests(client, user_id: str = None):
    query = client.table("leave_requests").select("*, profiles:profiles!leave_requests_user_id_fkey(full_name, avatar_color, department)")
    if user_id:
        query = query.eq("user_id", user_id)
    return query.order("created_at", desc=True).execute()

def get_calendar_leaves(client, start_date: str, end_date: str):
    return client.table("leave_requests").select(
        "id, user_id, leave_type, start_date, end_date, days_count, status, profiles:profiles!leave_requests_user_id_fkey(full_name, avatar_color, department)"
    ).gte("end_date", start_date).lte("start_date", end_date).execute()

def create_leave_request(client, data: dict):
    return client.table("leave_requests").insert(data).execute()

def update_leave_request_status(client, req_id: str, status: str, decided_by: str):
    from datetime import datetime, timezone
    return client.table("leave_requests").update({
        "status": status,
        "decided_by": decided_by,
        "decided_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", req_id).execute()

def get_reimbursements(client, user_id: str = None):
    query = client.table("reimbursement_claims").select(
        "*, profiles:profiles!reimbursement_claims_user_id_fkey(full_name, department, bank_account_holder, bank_name, bank_account_number, ifsc_code, upi_id)"
    )
    if user_id:
        query = query.eq("user_id", user_id)
    return query.order("created_at", desc=True).execute()

def create_reimbursement(client, data: dict):
    return client.table("reimbursement_claims").insert(data).execute()

def update_reimbursement_status(client, claim_id: str, status: str, approver_id: str):
    from datetime import datetime, timezone
    return client.table("reimbursement_claims").update({
        "status": status,
        "approved_by": approver_id,
        "approved_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", claim_id).execute()

def mark_reimbursement_paid(client, claim_id: str, paid_by: str):
    from datetime import datetime, timezone
    return client.table("reimbursement_claims").update({
        "status": "paid",
        "paid_by": paid_by,
        "paid_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", claim_id).execute()

def get_payslips(client, user_id: str = None):
    query = client.table("payslips").select("*, profiles:profiles!payslips_user_id_fkey(full_name, department)")
    if user_id:
        query = query.eq("user_id", user_id)
    return query.order("pay_period_date", desc=True).execute()

def get_insurance_cover(client, user_id: str):
    return client.table("insurance_cover").select("*").eq("user_id", user_id).execute()

def get_company_policies(client):
    return client.table("company_policies").select("*").order("sort_order", desc=False).execute()

def update_company_policy(client, policy_id: str, body: str, updated_by: str):
    from datetime import datetime, timezone
    return client.table("company_policies").update({
        "body": body,
        "updated_by": updated_by,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", policy_id).execute()

def get_company_holidays(client, year: int = None):
    query = client.table("company_holidays").select("*").order("holiday_date", desc=False)
    if year:
        query = query.eq("year", year)
    return query.execute()

def add_company_holiday(client, name: str, holiday_date: str, year: int = None):
    if not year:
        year = int(holiday_date.split("-")[0])
    return client.table("company_holidays").upsert({
        "name": name,
        "holiday_date": holiday_date,
        "year": year
    }, on_conflict="holiday_date").execute()

def bulk_add_company_holidays(client, holidays: list):
    payload = []
    for h in holidays:
        d = h.get("holiday_date")
        y = h.get("year") or (int(d.split("-")[0]) if d else 2026)
        payload.append({
            "name": h.get("name"),
            "holiday_date": d,
            "year": y
        })
    return client.table("company_holidays").upsert(payload, on_conflict="holiday_date").execute()

def delete_company_holiday(client, holiday_id: str):
    return client.table("company_holidays").delete().eq("id", holiday_id).execute()

def get_talent_of_the_month(client):
    return client.table("talent_of_the_month").select(
        "*, profiles:profiles!talent_of_the_month_user_id_fkey(full_name, department, avatar_color)"
    ).eq("is_current", True).limit(1).execute()

def cheer_talent(client, talent_id: str):
    res = client.table("talent_of_the_month").select("cheers_count").eq("id", talent_id).single().execute()
    count = (res.data.get("cheers_count") or 0) + 1 if res.data else 1
    return client.table("talent_of_the_month").update({"cheers_count": count}).eq("id", talent_id).execute()

def get_talent_nominations(client):
    return client.table("talent_nominations").select(
        "id, why_text, created_at, nominee:profiles!talent_nominations_nominee_id_fkey(id, full_name, department, avatar_color), nominator:profiles!talent_nominations_nominated_by_fkey(full_name)"
    ).order("created_at", desc=True).execute()

def create_talent_nomination(client, data: dict):
    return client.table("talent_nominations").insert(data).execute()

def crown_new_talent(client, user_id: str, month_year: str, why_text: str, crowned_by: str, nomination_id: str = None):
    # Set existing current talent to false
    client.table("talent_of_the_month").update({"is_current": False}).eq("is_current", True).execute()
    # If a talent for this month_year already exists, remove or archive it
    client.table("talent_of_the_month").update({"is_current": False}).eq("month_year", month_year).execute()
    # Insert new talent
    new_talent = {
        "user_id": user_id,
        "month_year": month_year,
        "why_text": why_text,
        "cheers_count": 0,
        "is_current": True,
        "crowned_by": crowned_by
    }
    res = client.table("talent_of_the_month").insert(new_talent).execute()
    if nomination_id:
        try:
            client.table("talent_nominations").delete().eq("id", nomination_id).execute()
        except Exception:
            pass
    return res

def get_hall_of_flex(client):
    return client.table("talent_of_the_month").select(
        "id, month_year, why_text, cheers_count, created_at, profiles:profiles!talent_of_the_month_user_id_fkey(full_name, department, avatar_color)"
    ).order("created_at", desc=True).execute()

def delete_talent(client, talent_id: str):
    return client.table("talent_of_the_month").delete().eq("id", talent_id).execute()


