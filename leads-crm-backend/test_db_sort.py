from db.client import supabase_anon
try:
    res = supabase_anon.table("leads").select("next_action_assignee, created_at").order("next_action_assignee", nullsfirst=False).order("created_at", desc=True).limit(5).execute()
    print("Success:", res.data)
except Exception as e:
    print("Error:", e)
