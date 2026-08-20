from fastapi import HTTPException, Depends
from auth.dependencies import get_current_user
from db.queries import get_profile_role
from db.client import get_client_for_user


def require_admin(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    profile = get_profile_role(client, user.id)

    if profile.data["role_level"] < 1:
        raise HTTPException(status_code=403, detail="Only admins can perform this action")

    return user