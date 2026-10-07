from db.client import supabase_anon
try:
    res = supabase_anon.table("leads").select("next_action_assignee").limit(1).execute()
    print("Success:", res.data)
except Exception as e:
    print("Error:", e)
