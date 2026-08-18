from fastapi import Header, HTTPException
from db.client import supabase
from supabase_auth.errors import AuthApiError

ALLOWED_DOMAIN = "workfloww.ai"


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.replace("Bearer ", "")
    try:
        user_response = supabase.auth.get_user(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    if not user_response or not getattr(user_response, "user", None):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = user_response.user
    user_email = getattr(user, "email", None) or ""
    if not user_email.lower().endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(
            status_code=403,
            detail="You are not a part of our team",
        )

    return user
