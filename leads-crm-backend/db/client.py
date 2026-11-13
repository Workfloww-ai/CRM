import os
from dotenv import load_dotenv
from supabase import create_client, ClientOptions

# Ensure .env is loaded whether run from repo root or leads-crm-backend
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase_anon = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
else:
    # Fallback to prevent crash on import, but queries will fail if used
    supabase_anon = None

def get_admin_client():
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ADMIN_KEY")
        or SUPABASE_SERVICE_ROLE_KEY
    )
    if SUPABASE_URL and key:
        return create_client(SUPABASE_URL, key)
    return None

def get_client_for_user(token: str):
    admin = get_admin_client()
    if admin:
        return admin
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=options)
    # Also explicitly set it for postgrest just in case
    client.postgrest.auth(token)
    return client
