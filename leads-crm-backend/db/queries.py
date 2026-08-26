


LEAD_COLUMNS = (
    "id, first_name, last_name, title, org, email, phone, phone_2, "
    "linkedin, location, industry, revenue, currency, status, "
    "next_action, due_date, created_at, updated_at, deleted_at"
)
PROFILE_COLUMNS = "id, full_name, email, role_level, created_at"
ACTIVITY_COLUMNS = "id, lead_id, user_id, type, content, metadata, created_at"
ATTACHMENT_COLUMNS = "id, lead_id, file_name, storage_path, uploaded_by, created_at"


def get_all_leads(client):
    return client.table("leads").select(LEAD_COLUMNS).is_("deleted_at", "null").execute()


def get_leads_page(client, page=1, page_size=20, search=None, name=None, org=None,
                    title=None, location=None, industry=None, function=None, sort_by="created_at", sort_desc=True):
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


def get_signed_attachment_url(client, storage_path: str, expires_in: int = 60):
    return client.storage.from_("lead-attachments").create_signed_url(storage_path, expires_in)


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
    "function, linkedin, location, revenue, currency, status, next_action, due_date, "
    "created_at, updated_at, deleted_at"
)

def get_all_fractional_leaders(client):
    return client.table('fractional_leaders').select(FRACTIONAL_LEADER_COLUMNS).is_('deleted_at', 'null').execute()

def get_fractional_leaders_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("fractional_leaders").select(
        f"{FRACTIONAL_LEADER_COLUMNS}, fractional_leader_activities(created_at, profiles(full_name))", count="exact"
    ).is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="fractional_leader_activities", desc=True).limit(1, foreign_table="fractional_leader_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",domain.ilike."{p}"')

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
    "function, linkedin, location, revenue, currency, status, next_action, due_date, "
    "created_at, updated_at, deleted_at"
)

def get_all_training_partners(client):
    return client.table('training_partners').select(TRAINING_PARTNER_COLUMNS).is_('deleted_at', 'null').execute()

def get_training_partners_page(client, page=1, page_size=20, search=None, sort_by="created_at", sort_desc=True):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = client.table("training_partners").select(f"{TRAINING_PARTNER_COLUMNS}, training_partner_activities(created_at, profiles(full_name))", count="exact").is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="training_partner_activities", desc=True).limit(1, foreign_table="training_partner_activities")

    if search:
        p = f'%{search.replace(chr(34), "")}%'
        query = query.or_(f'first_name.ilike."{p}",last_name.ilike."{p}",organization.ilike."{p}"')

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
