from db.client import supabase


def get_all_leads():
    return (
        supabase.table("leads")
        .select("id, first_name, last_name, title, org, email, phone, phone_2, linkedin, location, industry, revenue, currency, status, next_action, due_date, created_at, updated_at, deleted_at")
        .is_("deleted_at", "null")
        .execute()
    )


def create_lead(lead_data: dict):
    return supabase.table("leads").insert(lead_data).execute()


def update_lead(lead_id: str, update_data: dict):
    return supabase.table("leads").update(update_data).eq("id", lead_id).execute()


def get_lead_status(lead_id: str):
    return supabase.table("leads").select("status").eq("id", lead_id).single().execute()


def delete_lead(lead_id: str):
    from datetime import datetime, timezone
    return supabase.table("leads").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", lead_id).execute()


def get_profile(user_id: str):
    return (
        supabase.table("profiles")
        .select("id, full_name, email, role_level, created_at")
        .eq("id", user_id)
        .single()
        .execute()
    )


def get_profile_role(user_id: str):
    return supabase.table("profiles").select("role_level").eq("id", user_id).single().execute()


def create_activity(activity_data: dict):
    return supabase.table("lead_activities").insert(activity_data).execute()


def get_lead_activities(lead_id: str):
    return (
        supabase.table("lead_activities")
        .select("id, lead_id, user_id, type, content, metadata, created_at, profiles(full_name)")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .execute()
    )


def insert_lead(lead_data: dict):
    return supabase.table("leads").insert(lead_data).execute()


def upload_file_to_storage(storage_path: str, file_bytes: bytes, content_type: str):
    return supabase.storage.from_("lead-attachments").upload(
        storage_path, file_bytes, {"content-type": content_type}
    )


def create_attachment_record(attachment_data: dict):
    return supabase.table("attachments").insert(attachment_data).execute()


def get_lead_attachments(lead_id: str):
    return (
        supabase.table("attachments")
        .select("id, lead_id, file_name, storage_path, uploaded_by, created_at, profiles(full_name)")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .execute()
    )


def get_attachment(attachment_id: str):
    return (
        supabase.table("attachments")
        .select("id, lead_id, file_name, storage_path, uploaded_by, created_at")
        .eq("id", attachment_id)
        .single()
        .execute()
    )


def get_signed_attachment_url(storage_path: str, expires_in: int = 60):
    return supabase.storage.from_("lead-attachments").create_signed_url(storage_path, expires_in)


def delete_file_from_storage(storage_path: str):
    return supabase.storage.from_("lead-attachments").remove([storage_path])


def delete_attachment_record(attachment_id: str):
    return supabase.table("attachments").delete().eq("id", attachment_id).execute()

def get_leads_page(
    page: int = 1,
    page_size: int = 20,
    search: str = None,
    name: str = None,
    org: str = None,
    title: str = None,
    location: str = None,
    industry: str = None,
    sort_by: str = "created_at",
    sort_desc: bool = True
):
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = supabase.table("leads").select(
        "id, first_name, last_name, title, org, email, phone, phone_2, linkedin, location, industry, revenue, currency, status, next_action, due_date, created_at, updated_at, deleted_at, lead_activities(created_at, profiles(full_name))",
        count="exact"
    )
    query = query.is_("deleted_at", "null")
    query = query.order("created_at", foreign_table="lead_activities", desc=True).limit(1, foreign_table="lead_activities")

    if search:
        safe_search = search.replace('"', '')
        search_pattern = f'%{safe_search}%'
        query = query.or_(f'first_name.ilike."{search_pattern}",last_name.ilike."{search_pattern}",org.ilike."{search_pattern}",title.ilike."{search_pattern}",location.ilike."{search_pattern}",industry.ilike."{search_pattern}"')
    
    if name:
        safe_name = name.replace('"', '')
        name_pattern = f'%{safe_name}%'
        query = query.or_(f'first_name.ilike."{name_pattern}",last_name.ilike."{name_pattern}"')
    if org:
        org_pattern = f"%{org}%"
        query = query.ilike("org", org_pattern)
    if title:
        title_pattern = f"%{title}%"
        query = query.ilike("title", title_pattern)
    if location:
        location_pattern = f"%{location}%"
        query = query.ilike("location", location_pattern)
    if industry:
        industry_pattern = f"%{industry}%"
        query = query.ilike("industry", industry_pattern)

    query = query.order(sort_by, desc=sort_desc, nullsfirst=False)
    query = query.range(start, end)
    
    return query.execute()