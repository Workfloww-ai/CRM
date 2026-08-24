import os
from dotenv import load_dotenv
from supabase import create_client, ClientOptions

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

supabase_anon = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

def get_client_for_user(token: str):
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=options)
    # Also explicitly set it for postgrest just in case
    client.postgrest.auth(token)
    return client