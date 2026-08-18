from fastapi import Header, HTTPException
from db.client import supabase
from supabase_auth.errors import AuthApiError


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

    return user_response.user