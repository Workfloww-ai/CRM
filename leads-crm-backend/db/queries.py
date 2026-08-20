from db.client import supabase  # service-role client, used only for storage ops


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


# Storage stays on service-role client — see AGENTS.md for why.
def upload_file_to_storage(storage_path: str, file_bytes: bytes, content_type: str):
    return supabase.storage.from_("lead-attachments").upload(storage_path, file_bytes, {"content-type": content_type})


def get_signed_attachment_url(storage_path: str, expires_in: int = 60):
    return supabase.storage.from_("lead-attachments").create_signed_url(storage_path, expires_in)


def delete_file_from_storage(storage_path: str):
    return supabase.storage.from_("lead-attachments").remove([storage_path])