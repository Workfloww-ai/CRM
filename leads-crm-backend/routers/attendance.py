import os
import io
import csv
import logging
from calendar import monthrange
from datetime import datetime, timezone, timedelta, time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse, StreamingResponse

from auth.dependencies import get_current_user
from auth.permissions import require_hrms_manager, require_hrms_manager_or_admin
from db.client import get_client_for_user, get_admin_client, supabase_anon
from models import (
    CheckInRequest,
    CheckOutRequest,
    SiteCreate,
    SiteUpdate,
    ShiftCreate,
    AttendanceManualCorrection,
    CheckinReminderRequest,
)
from services.whatsapp import (
    verify_meta_signature,
    send_whatsapp_message,
    send_location_request_message,
    send_checkout_reminder_message,
    send_checkin_prompt_message,
    send_checkin_reminder_template,
    normalize_phone,
    extract_whatsapp_message,
    WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET,
)

logger = logging.getLogger("attendance_router")
router = APIRouter(prefix="/hrms/attendance", tags=["flowwies-attendance"])

# IST timezone (UTC+5:30) for accurate local dates and times
IST = timezone(timedelta(hours=5, minutes=30))

# Fallback default Alt.F Coworking coordinates (Noida / Gurgaon / Delhi NCR standard)
DEFAULT_ALT_F_COORDINATES = {
    "name": "Alt.F Coworking",
    "address": "Alt.F Coworking, Sector 142 / Golf Course Road, Delhi NCR",
    "latitude": 28.5034,
    "longitude": 77.4054,
    "radius_meters": 200,
}


def get_ist_now() -> datetime:
    return datetime.now(IST)


def get_ist_today_str() -> str:
    return get_ist_now().strftime("%Y-%m-%d")


def get_month_date_range(month_str: str) -> tuple:
    """
    Given a month string 'YYYY-MM', returns (start_date, end_date)
    with accurate last day of the month (e.g. 2026-11-30, not 2026-11-31).
    """
    try:
        parts = month_str.strip().split("-")
        year = int(parts[0])
        month = int(parts[1])
        _, last_day = monthrange(year, month)
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"
    except Exception:
        now = get_ist_now()
        _, last_day = monthrange(now.year, now.month)
        return f"{now.year:04d}-{now.month:02d}-01", f"{now.year:04d}-{now.month:02d}-{last_day:02d}"


def ensure_default_site(client):
    """Ensures at least one active office site (Alt.F Coworking) exists."""
    try:
        res = client.table("attendance_sites").select("*").eq("is_active", True).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]

        # Seed Alt.F Coworking
        new_site = {
            "name": DEFAULT_ALT_F_COORDINATES["name"],
            "address": DEFAULT_ALT_F_COORDINATES["address"],
            "latitude": DEFAULT_ALT_F_COORDINATES["latitude"],
            "longitude": DEFAULT_ALT_F_COORDINATES["longitude"],
            "radius_meters": DEFAULT_ALT_F_COORDINATES["radius_meters"],
            "is_active": True,
        }
        ins = client.table("attendance_sites").insert(new_site).execute()
        return ins.data[0] if ins.data else new_site
    except Exception as e:
        logger.warning(f"Failed to ensure default site: {e}")
        return DEFAULT_ALT_F_COORDINATES


def get_default_shift(client):
    try:
        res = client.table("attendance_shifts").select("*").eq("is_default", True).execute()
        if res.data:
            return res.data[0]
        # Any shift
        any_shift = client.table("attendance_shifts").select("*").limit(1).execute()
        if any_shift.data:
            return any_shift.data[0]
    except Exception:
        pass
    return {"id": None, "name": "General", "start_time": "09:00:00", "end_time": "18:00:00", "grace_minutes": 15}


def check_geofence_with_postgis(client, lat: float, lng: float, site_id: str) -> bool:
    """Uses the PostGIS RPC function created in migration 012 to test geofence."""
    try:
        rpc_res = client.rpc("is_within_geofence", {
            "check_lat": float(lat),
            "check_lng": float(lng),
            "p_site_id": str(site_id),
        }).execute()
        if rpc_res.data is not None:
            return bool(rpc_res.data)
    except Exception as e:
        logger.warning(f"PostGIS RPC is_within_geofence failed, using fallback formula: {e}")

    # Fallback to Haversine distance in python if PostGIS extension had an error
    try:
        site_res = client.table("attendance_sites").select("*").eq("id", site_id).execute()
        if site_res.data:
            site = site_res.data[0]
            import math
            R = 6371000  # meters
            phi1 = math.radians(lat)
            phi2 = math.radians(site["latitude"])
            dphi = math.radians(site["latitude"] - lat)
            dlam = math.radians(site["longitude"] - lng)
            a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            dist = R * c
            return dist <= float(site.get("radius_meters", 200))
    except Exception:
        pass

    return False


def is_checkin_late(shift: dict, check_in_dt: datetime) -> bool:
    try:
        st_parts = str(shift.get("start_time", "09:00:00")).split(":")
        shift_hour = int(st_parts[0])
        shift_min = int(st_parts[1])
        grace = int(shift.get("grace_minutes", 15))

        threshold_minutes = shift_hour * 60 + shift_min + grace
        actual_minutes = check_in_dt.hour * 60 + check_in_dt.minute
        return actual_minutes > threshold_minutes
    except Exception:
        return False


# =========================================================================
# 1. EMPLOYEE ATTENDANCE ENDPOINTS
# =========================================================================

@router.get("/today")
def get_today_attendance(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    today_str = get_ist_today_str()

    ensure_default_site(client)
    shift = get_default_shift(client)

    rec = client.table("attendance_records") \
        .select("*, attendance_sites(name, address, radius_meters)") \
        .eq("user_id", user.id) \
        .eq("date", today_str) \
        .execute()

    record = rec.data[0] if rec.data else None

    # Check if user is on approved leave today
    leave = client.table("leave_requests") \
        .select("*") \
        .eq("user_id", user.id) \
        .eq("status", "approved") \
        .lte("start_date", today_str) \
        .gte("end_date", today_str) \
        .execute()
    is_on_leave = bool(leave.data and len(leave.data) > 0)
    leave_info = leave.data[0] if is_on_leave else None

    # Check if today is a company holiday
    holiday = client.table("company_holidays") \
        .select("*") \
        .eq("holiday_date", today_str) \
        .execute()
    is_holiday = bool(holiday.data and len(holiday.data) > 0)
    holiday_info = holiday.data[0] if is_holiday else None

    sites = client.table("attendance_sites").select("*").eq("is_active", True).execute().data or []

    return {
        "date": today_str,
        "record": record,
        "is_checked_in": record is not None and record.get("check_in_at") is not None,
        "is_checked_out": record is not None and record.get("check_out_at") is not None,
        "is_on_leave": is_on_leave,
        "leave_info": leave_info,
        "is_holiday": is_holiday,
        "holiday_info": holiday_info,
        "shift": shift,
        "available_sites": sites,
    }


@router.post("/check-in")
def employee_check_in(body: CheckInRequest, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    today_str = get_ist_today_str()
    ist_now = get_ist_now()

    # 1. Prevent duplicate check-in
    existing = client.table("attendance_records") \
        .select("*") \
        .eq("user_id", user.id) \
        .eq("date", today_str) \
        .execute()

    if existing.data and len(existing.data) > 0:
        rec = existing.data[0]
        if rec.get("check_in_at"):
            raise HTTPException(status_code=400, detail="You have already checked in for today.")

    # 2. Pick site (user's assigned site, or first active site / Alt.F Coworking)
    site = ensure_default_site(client)
    site_id = site.get("id")

    # 3. Check PostGIS geofence
    within_geofence = check_geofence_with_postgis(client, body.latitude, body.longitude, site_id) if site_id else False

    # 4. Check if late
    shift = get_default_shift(client)
    late_flag = is_checkin_late(shift, ist_now)

    # 5. Insert or update record
    rec_payload = {
        "user_id": user.id,
        "site_id": site_id,
        "shift_id": shift.get("id") if shift else None,
        "check_in_at": ist_now.isoformat(),
        "check_in_latitude": body.latitude,
        "check_in_longitude": body.longitude,
        "check_in_within_geofence": within_geofence,
        "check_in_source": body.source or "web",
        "date": today_str,
        "status": "checked_in",
        "is_late": late_flag,
        "notes": body.notes,
    }

    if existing.data and len(existing.data) > 0:
        rec_id = existing.data[0]["id"]
        res = client.table("attendance_records").update(rec_payload).eq("id", rec_id).execute()
    else:
        res = client.table("attendance_records").insert(rec_payload).execute()

    saved = res.data[0] if res.data else rec_payload
    return {
        "status": "checked_in",
        "record": saved,
        "within_geofence": within_geofence,
        "is_late": late_flag,
        "site_name": site.get("name", "Alt.F Coworking"),
    }


@router.post("/check-out")
def employee_check_out(body: CheckOutRequest, user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    today_str = get_ist_today_str()
    ist_now = get_ist_now()

    # Find today's check-in record
    existing = client.table("attendance_records") \
        .select("*") \
        .eq("user_id", user.id) \
        .eq("date", today_str) \
        .execute()

    if not existing.data:
        raise HTTPException(status_code=400, detail="Cannot check out without checking in first.")

    rec = existing.data[0]
    if rec.get("check_out_at"):
        raise HTTPException(status_code=400, detail="You have already checked out for today.")

    site_id = rec.get("site_id")
    within_geofence = False
    if body.latitude and body.longitude and site_id:
        within_geofence = check_geofence_with_postgis(client, body.latitude, body.longitude, site_id)

    # Calculate hours worked
    in_time_str = rec.get("check_in_at")
    work_hours = None
    if in_time_str:
        try:
            in_dt = datetime.fromisoformat(in_time_str.replace("Z", "+00:00"))
            diff_seconds = (ist_now.astimezone(timezone.utc) - in_dt.astimezone(timezone.utc)).total_seconds()
            work_hours = round(max(0.0, diff_seconds / 3600.0), 2)
        except Exception as e:
            logger.warning(f"Error computing work hours: {e}")

    upd_payload = {
        "check_out_at": ist_now.isoformat(),
        "check_out_latitude": body.latitude,
        "check_out_longitude": body.longitude,
        "check_out_within_geofence": within_geofence,
        "status": "checked_out",
        "work_hours": work_hours,
    }
    if body.notes:
        existing_notes = rec.get("notes") or ""
        upd_payload["notes"] = f"{existing_notes}\nOut: {body.notes}".strip()

    res = client.table("attendance_records").update(upd_payload).eq("id", rec["id"]).execute()
    saved = res.data[0] if res.data else upd_payload

    return {
        "status": "checked_out",
        "record": saved,
        "work_hours": work_hours,
    }


@router.get("/my-history")
def get_my_attendance_history(
    month: Optional[str] = None,  # YYYY-MM
    limit: int = 31,
    user=Depends(get_current_user),
):
    client = get_client_for_user(user.token)
    query = client.table("attendance_records") \
        .select("*, attendance_sites(name, address)") \
        .eq("user_id", user.id) \
        .order("date", desc=True) \
        .limit(limit)

    if month:
        start_date, end_date = get_month_date_range(month)
        query = query.gte("date", start_date).lte("date", end_date)

    try:
        res = query.execute()
        return res.data or []
    except Exception as e:
        logger.warning(f"Error fetching attendance history: {e}")
        # Fallback without site embed
        try:
            plain_query = client.table("attendance_records") \
                .select("*") \
                .eq("user_id", user.id) \
                .order("date", desc=True) \
                .limit(limit)
            if month:
                start_date, end_date = get_month_date_range(month)
                plain_query = plain_query.gte("date", start_date).lte("date", end_date)
            return plain_query.execute().data or []
        except Exception:
            return []


# =========================================================================
# 2. MANAGER TEAM ATTENDANCE & REPORTING
# =========================================================================

@router.get("/team")
def get_team_today_attendance(
    target_date: Optional[str] = None,
    user=Depends(require_hrms_manager_or_admin),
):
    client = get_client_for_user(user.token)
    date_str = target_date or get_ist_today_str()

    # 1. Fetch all active employees
    employees = []
    try:
        emp_res = client.table("profiles") \
            .select("id, full_name, email, emp_code, department, phone, avatar_color, is_active") \
            .eq("is_active", True) \
            .order("full_name") \
            .execute()
        employees = emp_res.data or []
    except Exception as e:
        logger.error(f"Error fetching profiles for /team: {e}")
        try:
            admin_client = get_admin_client() or supabase_anon
            emp_res = admin_client.table("profiles") \
                .select("id, full_name, email, emp_code, department, phone, avatar_color, is_active") \
                .eq("is_active", True) \
                .order("full_name") \
                .execute()
            employees = emp_res.data or []
        except Exception:
            pass

    # 2. Fetch all attendance records for date
    records = []
    try:
        rec_res = client.table("attendance_records") \
            .select("*, attendance_sites(name)") \
            .eq("date", date_str) \
            .execute()
        records = rec_res.data or []
    except Exception as e:
        logger.warning(f"attendance_sites embed warning: {e}, falling back to plain select")
        try:
            rec_res = client.table("attendance_records") \
                .select("*") \
                .eq("date", date_str) \
                .execute()
            records = rec_res.data or []
        except Exception as e2:
            logger.error(f"Failed to fetch attendance records: {e2}")

    rec_by_user = {r["user_id"]: r for r in records if "user_id" in r}

    # 3. Fetch leaves on date (Do NOT embed profiles - leave_requests has 2 foreign keys to profiles causing PGRST201)
    leaves = []
    try:
        leave_res = client.table("leave_requests") \
            .select("*") \
            .eq("status", "approved") \
            .lte("start_date", date_str) \
            .gte("end_date", date_str) \
            .execute()
        leaves = leave_res.data or []
    except Exception as e:
        logger.warning(f"Error fetching leave_requests for /team: {e}")

    leave_by_user = {l["user_id"]: l for l in leaves if "user_id" in l}

    # 4. Check if holiday
    holiday = []
    try:
        hol_res = client.table("company_holidays").select("*").eq("holiday_date", date_str).execute()
        holiday = hol_res.data or []
    except Exception as e:
        logger.warning(f"Error fetching company_holidays for /team: {e}")

    team_status = []
    present_count = 0
    late_count = 0
    on_leave_count = 0
    absent_count = 0

    for emp in employees:
        uid = emp["id"]
        rec = rec_by_user.get(uid)
        leave = leave_by_user.get(uid)

        computed_status = "absent"
        if rec:
            computed_status = rec.get("status", "checked_in")
            present_count += 1
            if rec.get("is_late"):
                late_count += 1
        elif leave:
            computed_status = "on_leave"
            on_leave_count += 1
        elif holiday:
            computed_status = "holiday"
        else:
            absent_count += 1

        team_status.append({
            "employee": emp,
            "record": rec,
            "leave": leave,
            "status": computed_status,
        })

    return {
        "date": date_str,
        "is_holiday": bool(holiday),
        "holiday_name": holiday[0]["name"] if holiday else None,
        "summary": {
            "total_employees": len(employees),
            "present": present_count,
            "late": late_count,
            "on_leave": on_leave_count,
            "absent": absent_count,
        },
        "members": team_status,
    }


@router.get("/report")
def get_monthly_attendance_report(
    month: str = Query(..., description="Format: YYYY-MM e.g. 2026-11"),
    user=Depends(require_hrms_manager_or_admin),
):
    client = get_client_for_user(user.token)
    start_date, end_date = get_month_date_range(month)

    # All active profiles
    profiles = []
    try:
        prof_res = client.table("profiles").select("id, full_name, email, department, emp_code").eq("is_active", True).execute()
        profiles = prof_res.data or []
    except Exception as e:
        logger.error(f"Error fetching profiles for /report: {e}")
        try:
            admin_client = get_admin_client() or supabase_anon
            profiles = admin_client.table("profiles").select("id, full_name, email, department, emp_code").eq("is_active", True).execute().data or []
        except Exception:
            pass

    # All attendance in range
    records = []
    try:
        rec_res = client.table("attendance_records") \
            .select("*") \
            .gte("date", start_date) \
            .lte("date", end_date) \
            .execute()
        records = rec_res.data or []
    except Exception as e:
        logger.error(f"Error fetching attendance_records for /report: {e}")

    # All leaves in range
    leaves = []
    try:
        leave_res = client.table("leave_requests") \
            .select("*") \
            .eq("status", "approved") \
            .gte("end_date", start_date) \
            .lte("start_date", end_date) \
            .execute()
        leaves = leave_res.data or []
    except Exception as e:
        logger.error(f"Error fetching leave_requests for /report: {e}")

    # Holidays in month
    holidays = []
    try:
        hol_res = client.table("company_holidays") \
            .select("*") \
            .gte("holiday_date", start_date) \
            .lte("holiday_date", end_date) \
            .execute()
        holidays = hol_res.data or []
    except Exception as e:
        logger.error(f"Error fetching company_holidays for /report: {e}")

    # Aggregate by employee
    report_rows = []
    for p in profiles:
        uid = p["id"]
        emp_records = [r for r in records if r.get("user_id") == uid]
        present_days = len(emp_records)
        late_days = sum(1 for r in emp_records if r.get("is_late"))
        total_work_hours = sum(float(r.get("work_hours") or 0) for r in emp_records)
        avg_hours = round(total_work_hours / present_days, 2) if present_days > 0 else 0.0

        emp_leaves = [l for l in leaves if l.get("user_id") == uid]
        leave_days = sum(float(l.get("days_count") or 1) for l in emp_leaves)

        report_rows.append({
            "user_id": uid,
            "full_name": p["full_name"],
            "email": p["email"],
            "department": p.get("department") or "Operations",
            "emp_code": p.get("emp_code") or "-",
            "present_days": present_days,
            "late_days": late_days,
            "leave_days": leave_days,
            "total_hours": round(total_work_hours, 2),
            "avg_daily_hours": avg_hours,
        })

    return {
        "month": month,
        "total_holidays": len(holidays),
        "holidays": holidays,
        "employees": report_rows,
    }


@router.get("/export")
def export_attendance_csv(
    month: str = Query(..., description="Format: YYYY-MM"),
    user=Depends(require_hrms_manager_or_admin),
):
    client = get_client_for_user(user.token)
    start_date, end_date = get_month_date_range(month)

    records = []
    try:
        records = client.table("attendance_records") \
            .select("date, check_in_at, check_out_at, work_hours, is_late, check_in_within_geofence, check_in_source, profiles(full_name, email, emp_code, department)") \
            .gte("date", start_date) \
            .lte("date", end_date) \
            .order("date", desc=True) \
            .execute().data or []
    except Exception as e:
        logger.warning(f"Export query with profiles embed failed: {e}, falling back to plain select")
        try:
            records = client.table("attendance_records") \
                .select("date, check_in_at, check_out_at, work_hours, is_late, check_in_within_geofence, check_in_source, user_id") \
                .gte("date", start_date) \
                .lte("date", end_date) \
                .order("date", desc=True) \
                .execute().data or []
        except Exception:
            records = []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Employee Name", "Email", "Emp Code", "Department",
        "Check-In Time", "Check-Out Time", "Work Hours", "Is Late", "Within Geo-Fence", "Source"
    ])

    def sanitize_csv_cell(value):
        if value is None:
            return ""
        val_str = str(value)
        if val_str and val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
            return f"'{val_str}"
        return val_str

    for r in records:
        prof = r.get("profiles") or {}
        writer.writerow([
            sanitize_csv_cell(r.get("date")),
            sanitize_csv_cell(prof.get("full_name", "")),
            sanitize_csv_cell(prof.get("email", "")),
            sanitize_csv_cell(prof.get("emp_code", "")),
            sanitize_csv_cell(prof.get("department", "")),
            sanitize_csv_cell(r.get("check_in_at") or "-"),
            sanitize_csv_cell(r.get("check_out_at") or "-"),
            sanitize_csv_cell(r.get("work_hours") or "-"),
            "Yes" if r.get("is_late") else "No",
            "Yes" if r.get("check_in_within_geofence") else "No",
            sanitize_csv_cell(r.get("check_in_source") or "web"),
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_{month}.csv"},
    )


# =========================================================================
# 3. OFFICE SITES & SHIFTS CONFIGURATION
# =========================================================================

@router.get("/sites")
def list_sites(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    ensure_default_site(client)
    res = client.table("attendance_sites").select("*").eq("is_active", True).order("created_at").execute()
    return res.data or []


@router.post("/sites")
def create_site(body: SiteCreate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    res = client.table("attendance_sites").insert(body.model_dump()).execute()
    return res.data[0] if res.data else {"status": "created"}


@router.patch("/sites/{site_id}")
def update_site(site_id: str, body: SiteUpdate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    data = body.model_dump(exclude_unset=True)
    res = client.table("attendance_sites").update(data).eq("id", site_id).execute()
    return res.data[0] if res.data else {"status": "updated"}


@router.get("/shifts")
def list_shifts(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    res = client.table("attendance_shifts").select("*").order("name").execute()
    return res.data or []


# =========================================================================
# 4. WHATSAPP WEBHOOK HANDLERS (mobiCOMM & META CLOUD API)
# =========================================================================

def handle_whatsapp_webhook_verification(request: Request):
    """
    Webhook verification handshake endpoint required by Meta WhatsApp Cloud API and mobiCOMM.
    Meta sends GET request with hub.mode, hub.verify_token, hub.challenge.
    mobiCOMM and other BSPs may send challenge, or simple GET health check.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge") or params.get("challenge")

    if challenge:
        # If token is supplied, verify it matches WHATSAPP_VERIFY_TOKEN
        if token and token != WHATSAPP_VERIFY_TOKEN:
            logger.warning(f"WhatsApp Webhook verification failed. Received token: {token}")
            raise HTTPException(status_code=403, detail="Invalid verification token")
        logger.info("WhatsApp Webhook verified successfully with challenge handshake!")
        return PlainTextResponse(content=str(challenge), status_code=200)

    # General ping / handshake check
    return {"status": "ok", "message": "WhatsApp webhook endpoint is active and listening"}


def record_attendance_in_supabase(client, user_id: str, today_str: str, check_in_iso: str,
                                 lat: float = None, lng: float = None, within_fence: bool = False,
                                 is_late: bool = False, site_id: str = None, shift_id: str = None):
    """
    Saves or updates attendance record in Supabase.
    Uses SECURITY DEFINER RPC 'record_whatsapp_punch' first to guarantee execution
    even if the Cloud Run backend only has the anon key (avoiding RLS error 42501).
    Falls back to direct table write if RPC is unavailable.
    """
    # 1. Try secure RPC function (bypasses RLS)
    try:
        rpc_payload = {
            "p_user_id": str(user_id),
            "p_date": today_str,
            "p_check_in_at": check_in_iso,
            "p_lat": float(lat) if lat is not None else None,
            "p_lng": float(lng) if lng is not None else None,
            "p_within_fence": bool(within_fence),
            "p_is_late": bool(is_late),
            "p_site_id": str(site_id) if site_id else None,
        }
        res = client.rpc("record_whatsapp_punch", rpc_payload).execute()
        if res.data and isinstance(res.data, dict) and "record" in res.data:
            print(f"[WHATSAPP WEBHOOK] Attendance saved via RPC record_whatsapp_punch: {res.data.get('status')}", flush=True)
            return res.data.get("record")
    except Exception as rpc_e:
        print(f"[WHATSAPP WEBHOOK] RPC record_whatsapp_punch warning/fallback: {rpc_e}", flush=True)

    # 2. Fallback to direct table query
    rec_payload = {
        "user_id": user_id,
        "site_id": site_id,
        "shift_id": shift_id,
        "check_in_at": check_in_iso,
        "check_in_latitude": float(lat) if lat is not None else None,
        "check_in_longitude": float(lng) if lng is not None else None,
        "check_in_within_geofence": bool(within_fence),
        "check_in_source": "whatsapp",
        "date": today_str,
        "status": "checked_in",
        "is_late": bool(is_late),
    }
    try:
        existing = client.table("attendance_records").select("id").eq("user_id", user_id).eq("date", today_str).execute().data
        if existing:
            res = client.table("attendance_records").update(rec_payload).eq("id", existing[0]["id"]).execute()
        else:
            res = client.table("attendance_records").insert(rec_payload).execute()
        if res.data:
            print(f"[WHATSAPP WEBHOOK] Attendance saved via direct table write: {res.data[0].get('id')}", flush=True)
            return res.data[0]
    except Exception as table_e:
        print(f"[WHATSAPP WEBHOOK ERROR] Direct table insert/update failed: {table_e}", flush=True)

    return rec_payload


def checkout_attendance_in_supabase(client, user_id: str, today_str: str, check_out_iso: str, work_hours: float = None):
    """
    Updates attendance record for checkout in Supabase.
    Uses SECURITY DEFINER RPC 'checkout_whatsapp_punch' first, falling back to direct table update.
    """
    # 1. Try secure RPC
    try:
        rpc_payload = {
            "p_user_id": str(user_id),
            "p_date": today_str,
            "p_check_out_at": check_out_iso,
            "p_work_hours": float(work_hours) if work_hours is not None else None,
        }
        res = client.rpc("checkout_whatsapp_punch", rpc_payload).execute()
        if res.data and isinstance(res.data, dict) and "record" in res.data:
            print(f"[WHATSAPP WEBHOOK] Checkout recorded via RPC checkout_whatsapp_punch", flush=True)
            return res.data["record"]
    except Exception as rpc_e:
        print(f"[WHATSAPP WEBHOOK] RPC checkout_whatsapp_punch warning/fallback: {rpc_e}", flush=True)

    # 2. Fallback to direct table update
    try:
        existing = client.table("attendance_records").select("id").eq("user_id", user_id).eq("date", today_str).execute().data
        if existing:
            res = client.table("attendance_records").update({
                "check_out_at": check_out_iso,
                "status": "checked_out",
                "work_hours": work_hours,
            }).eq("id", existing[0]["id"]).execute()
            if res.data:
                return res.data[0]
    except Exception as table_e:
        print(f"[WHATSAPP WEBHOOK ERROR] Direct checkout update failed: {table_e}", flush=True)

    return None


async def handle_incoming_whatsapp_webhook(request: Request):
    """
    Processes incoming messages from mobiCOMM or Meta WhatsApp Cloud API.
    Flow:
      1. Employee clicks "Check In" button -> Instantly records attendance in Supabase.
      2. Employee shares GPS location pin -> Geofence & shift time verified -> Updates attendance_records.
      3. Employee sends "OUT" / "Check Out" -> Check-out recorded -> Work duration calculated -> Confirmation sent.
    """
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    raw_body_str = body_bytes.decode("utf-8", errors="replace") if body_bytes else ""

    print(f"[WHATSAPP WEBHOOK] Incoming request received! Body: {raw_body_str}", flush=True)
    logger.info(f"Incoming WhatsApp webhook: {raw_body_str}")

    # 1. Enforce Meta Webhook Signature Verification
    # Strictly reject requests if WHATSAPP_APP_SECRET is not configured, signature header is missing,
    # or HMAC-SHA256 signature does not match the payload.
    if not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid or missing signature received on WhatsApp webhook.")
        print("[WHATSAPP WEBHOOK] Signature verification failed! Request rejected.", flush=True)
        return Response(content="Invalid or missing signature", status_code=403)

    try:
        import json
        payload = json.loads(raw_body_str) if raw_body_str else {}
    except Exception as e:
        logger.error(f"Failed to parse WhatsApp JSON payload: {e}")
        print(f"[WHATSAPP WEBHOOK ERROR] JSON parse error: {e}", flush=True)
        return Response(content="Bad JSON", status_code=400)

    # 2. Extract sender, message, and location (handles both Meta and mobiCOMM payloads)
    msg_info = extract_whatsapp_message(payload)
    if not msg_info:
        print(f"[WHATSAPP WEBHOOK] extract_whatsapp_message returned None for payload: {payload}", flush=True)
        return {"status": "received"}

    from_phone = msg_info.get("from_phone")
    if not from_phone:
        print("[WHATSAPP WEBHOOK] Ignored event with no sender phone.", flush=True)
        return {"status": "ignored_no_sender"}

    normalized_sender_phone = normalize_phone(from_phone)
    text_content = (msg_info.get("text") or "").strip().upper()
    lat = msg_info.get("latitude")
    lng = msg_info.get("longitude")

    print(f"[WHATSAPP WEBHOOK] Sender: {from_phone} (norm: {normalized_sender_phone}) | text: '{text_content}' | coords: ({lat}, {lng})", flush=True)
    logger.info(f"WhatsApp event from {from_phone} ({normalized_sender_phone}): text='{text_content}' lat={lat} lng={lng}")

    # Use admin service role client for webhook operations (bypasses RLS to match employee phone & record attendance)
    admin_client = get_admin_client()
    key_preview = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    print(f"[WHATSAPP WEBHOOK DB] Admin Client Loaded? {bool(admin_client)} (service_key_len: {len(key_preview)})", flush=True)

    if not admin_client:
        print("[WHATSAPP WEBHOOK WARNING] get_admin_client() returned None! Falling back to anon (queries may be blocked by RLS).", flush=True)
        admin_client = supabase_anon

    if not admin_client:
        logger.error("No Supabase client available for WhatsApp webhook handler.")
        print("[WHATSAPP WEBHOOK ERROR] admin_client is completely unavailable (missing SUPABASE_URL / keys)", flush=True)
        return {"status": "db_client_unavailable"}

    # 3. Find matching employee by phone number in profiles
    matched_user = None

    # Step 3a: Secure RPC function lookup (bypasses RLS securely via SECURITY DEFINER)
    try:
        rpc_res = admin_client.rpc("get_profile_by_phone", {"phone_query": normalized_sender_phone}).execute()
        if rpc_res.data and len(rpc_res.data) > 0:
            matched_user = rpc_res.data[0]
            print(f"[WHATSAPP WEBHOOK] Matched user via secure RPC get_profile_by_phone: {matched_user.get('full_name')} ({matched_user.get('id')})", flush=True)
    except Exception as rpc_err:
        print(f"[WHATSAPP WEBHOOK] RPC get_profile_by_phone: {rpc_err}", flush=True)

    # Step 3b: Direct table lookup if RPC returned nothing
    if not matched_user:
        try:
            direct = admin_client.table("profiles").select("id, full_name, email, phone").ilike("phone", f"%{normalized_sender_phone}%").execute().data or []
            if direct:
                matched_user = direct[0]
                print(f"[WHATSAPP WEBHOOK] Matched user via direct query: {matched_user.get('full_name')}", flush=True)
        except Exception as direct_err:
            print(f"[WHATSAPP WEBHOOK] Direct query: {direct_err}", flush=True)

    # Step 3c: Fallback full profiles table scan
    if not matched_user:
        try:
            all_profiles = admin_client.table("profiles").select("id, full_name, email, phone, emergency_contact_phone").execute().data or []
            print(f"[WHATSAPP WEBHOOK] Found {len(all_profiles)} employee profiles in Supabase table scan.", flush=True)
            for prof in all_profiles:
                prof_phone = normalize_phone(prof.get("phone", ""))
                emg_phone = normalize_phone(prof.get("emergency_contact_phone", ""))
                if (prof_phone and prof_phone == normalized_sender_phone) or (emg_phone and emg_phone == normalized_sender_phone):
                    matched_user = prof
                    break
        except Exception as db_err:
            print(f"[WHATSAPP WEBHOOK ERROR] Profile scan error: {db_err}", flush=True)

    if not matched_user:
        print(f"[WHATSAPP WEBHOOK WARNING] Sender phone '{normalized_sender_phone}' not found in any profile!", flush=True)
        send_whatsapp_message(
            from_phone,
            "⚠️ Hi! Your phone number is not registered in Flowwies HRMS.\n"
            "Please ask your HR manager to update your mobile number in the People & Access tab."
        )
        return {"status": "user_not_found"}

    user_id = matched_user["id"]
    emp_name = matched_user.get("full_name", "Team Member")
    today_str = get_ist_today_str()
    ist_now = get_ist_now()
    time_str = ist_now.strftime("%I:%M %p")
    print(f"[WHATSAPP WEBHOOK] Matched user: {emp_name} (ID: {user_id})", flush=True)

    # 4. Fetch today's attendance record for the employee
    existing = []
    try:
        existing = admin_client.table("attendance_records") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("date", today_str) \
            .execute().data or []
    except Exception as sel_err:
        print(f"[WHATSAPP WEBHOOK] Existing lookup warning: {sel_err}", flush=True)

    rec = existing[0] if existing else None
    has_checked_in = bool(rec and rec.get("check_in_at"))
    has_checked_out = bool(rec and rec.get("check_out_at"))

    site = ensure_default_site(admin_client)
    site_id = site.get("id") if site else None
    site_name = site.get("name", "Alt.F Coworking") if site else "Alt.F Coworking"

    # Explicit checkout trigger words (out, checkout, check-out, etc.)
    is_explicit_checkout = (
        text_content in ("OUT", "CHECK OUT", "CHECKOUT", "LEAVE", "EXIT", "CHECK-OUT", "CHECK_OUT", "BTN_CHECKOUT", "BYE")
        or "CHECK OUT" in text_content
        or "CHECKOUT" in text_content
        or "CHECK-OUT" in text_content
        or "BTN_CHECKOUT" in text_content
        or text_content.startswith("OUT")
        or text_content.endswith("OUT")
    )

    # =========================================================================
    # CASE A: GPS Location Attachment (Location Pin Shared)
    # =========================================================================
    if lat is not None and lng is not None:
        within_geofence = check_geofence_with_postgis(admin_client, float(lat), float(lng), site_id) if site_id else False

        # Determine if this location is for CHECK-OUT:
        is_checkout_location = False
        if has_checked_in and not has_checked_out:
            # If checkout was explicitly requested or check-in location is already recorded
            if rec.get("notes") == "checkout_requested" or rec.get("check_in_latitude") is not None:
                is_checkout_location = True

        if is_checkout_location:
            # Calculate work duration
            work_hours = None
            in_time_str = rec.get("check_in_at")
            if in_time_str:
                try:
                    in_dt = datetime.fromisoformat(in_time_str.replace("Z", "+00:00"))
                    diff_sec = (ist_now.astimezone(timezone.utc) - in_dt.astimezone(timezone.utc)).total_seconds()
                    work_hours = round(max(0.0, diff_sec / 3600.0), 2)
                except Exception:
                    pass

            upd_data = {
                "check_out_at": ist_now.isoformat(),
                "check_out_latitude": float(lat),
                "check_out_longitude": float(lng),
                "check_out_within_geofence": within_geofence,
                "status": "checked_out",
                "work_hours": work_hours,
                "notes": None,
            }
            try:
                admin_client.table("attendance_records").update(upd_data).eq("id", rec["id"]).execute()
            except Exception as upd_e:
                print(f"[WHATSAPP WEBHOOK ERROR] Checkout update failed: {upd_e}", flush=True)
                checkout_attendance_in_supabase(admin_client, user_id, today_str, ist_now.isoformat(), work_hours)

            fence_msg = f"✅ Inside {site_name} geo-fence." if within_geofence else f"⚠️ Outside office radius for {site_name}."
            hours_str = f"*{work_hours} hours*" if work_hours is not None else "full shift"

            reply = (
                f"👋 Goodbye {emp_name}!\n\n"
                f"✅ Check-out successfully recorded at {time_str}.\n"
                f"⏱️ Total work duration: {hours_str} completed today.\n"
                f"📍 Status: {fence_msg}\n\n"
                f"Thank you for your hard work today! Have a wonderful evening and see you tomorrow! 🌟"
            )
            send_whatsapp_message(from_phone, reply)
            return {"status": "checked_out", "work_hours": work_hours, "within_geofence": within_geofence}

        elif has_checked_out:
            prev_out = rec.get("check_out_at")
            try:
                out_dt = datetime.fromisoformat(prev_out.replace("Z", "+00:00")).astimezone(IST)
                out_str = out_dt.strftime("%I:%M %p")
            except Exception:
                out_str = prev_out
            send_whatsapp_message(
                from_phone,
                f"Hello {emp_name}, you have already checked out today at {out_str}.\nHave a wonderful evening! 🌟"
            )
            return {"status": "already_checked_out"}

        else:
            # Initial check-in with GPS location
            shift = get_default_shift(admin_client)
            late_flag = is_checkin_late(shift, ist_now)

            saved_rec = record_attendance_in_supabase(
                admin_client,
                user_id=user_id,
                today_str=today_str,
                check_in_iso=ist_now.isoformat(),
                lat=float(lat),
                lng=float(lng),
                within_fence=within_geofence,
                is_late=late_flag,
                site_id=site_id,
                shift_id=shift.get("id") if shift else None,
            )

            fence_msg = f"✅ Inside {site_name} geo-fence." if within_geofence else f"⚠️ Outside office radius for {site_name}."
            late_msg = " (Marked Late)" if late_flag else ""

            reply = (
                f"✅ Good morning {emp_name}!\n\n"
                f"Attendance marked at {time_str}{late_msg}.\n"
                f"Site: {site_name}\n"
                f"Status: {fence_msg}\n\n"
                f"Reply 'Check-Out' when leaving to end your shift. Have a productive day! 🚀"
            )
            send_whatsapp_message(from_phone, reply)
            return {"status": "check_in_recorded", "within_geofence": within_geofence, "record": saved_rec}

    # =========================================================================
    # CASE B: Text Message or Button Reply (Coordinates Not Sent)
    # =========================================================================

    # 1. User has ALREADY checked in and has NOT checked out yet:
    # Check-in happens only once per day. If user has already checked in and types
    # "out", "checkout", "check-out" OR "hi", "hello", or clicks a button,
    # trigger the CHECK-OUT flow!
    if has_checked_in and not has_checked_out:
        try:
            admin_client.table("attendance_records").update({"notes": "checkout_requested"}).eq("id", rec["id"]).execute()
        except Exception as upd_err:
            print(f"[WHATSAPP WEBHOOK] Could not set checkout_requested note: {upd_err}", flush=True)

        prompt_msg = (
            f"👋 Hi {emp_name}! Wrapping up your shift?\n\n"
            f"📍 Tap the button below to share your current location and verify your check-out at {site_name}."
        )
        send_location_request_message(from_phone, prompt_msg)
        return {"status": "checkout_location_requested"}

    # 2. User has ALREADY checked out for today
    if has_checked_out:
        prev_out = rec.get("check_out_at")
        try:
            out_dt = datetime.fromisoformat(prev_out.replace("Z", "+00:00")).astimezone(IST)
            out_str = out_dt.strftime("%I:%M %p")
        except Exception:
            out_str = prev_out
        work_hours = rec.get("work_hours")
        hours_str = f"*{work_hours} hours*" if work_hours is not None else "full shift"

        send_whatsapp_message(
            from_phone,
            f"Hello {emp_name}, you have already checked out today at {out_str}.\n"
            f"⏱️ Total work duration: {hours_str} recorded today.\n"
            f"Have a wonderful evening and see you tomorrow! 🌟"
        )
        return {"status": "already_checked_out"}

    # 3. User has NOT checked in yet today:
    # Check-out is strictly only allowed after check-in
    if is_explicit_checkout:
        send_whatsapp_message(
            from_phone,
            f"Hello {emp_name}, you haven't checked in yet today!\n\n"
            f"Check-out is only available after check-in. Tap 'Check In' or send 'IN' or share your GPS location to check in."
        )
        return {"status": "not_checked_in"}

    # First interaction of the day (e.g. "IN", "HI", "HELLO", "GOOD MORNING", button click, etc.)
    # -> Record CHECK-IN immediately in Supabase!
    shift = get_default_shift(admin_client)
    late_flag = is_checkin_late(shift, ist_now)

    saved_record = record_attendance_in_supabase(
        admin_client,
        user_id=user_id,
        today_str=today_str,
        check_in_iso=ist_now.isoformat(),
        within_fence=False,
        is_late=late_flag,
        site_id=site_id,
        shift_id=shift.get("id") if shift else None,
    )

    checkin_msg = (
        f"👋 Good morning {emp_name}! Ready to start your work day?\n\n"
        f"✅ Check-in recorded at {time_str}.\n"
        f"📍 Tap the button below to share your current location and verify attendance at {site_name}."
    )
    send_location_request_message(from_phone, checkin_msg)

    return {
        "status": "check_in_recorded",
        "user_id": user_id,
        "check_in_at": ist_now.isoformat(),
        "record": saved_record,
    }


@router.get("/webhook")
def attendance_webhook_get(request: Request):
    """Router webhook verification endpoint."""
    return handle_whatsapp_webhook_verification(request)


@router.post("/webhook")
async def attendance_webhook_post(request: Request):
    """Router incoming WhatsApp webhook endpoint."""
    return await handle_incoming_whatsapp_webhook(request)


# =========================================================================
# 5. WHATSAPP TEMPLATE REMINDER DISPATCH
# =========================================================================

@router.post("/send-checkin-reminder")
def trigger_checkin_reminder(
    body: CheckinReminderRequest,
    user=Depends(require_hrms_manager_or_admin),
):
    """
    Sends the WhatsApp template 'employee_checkin_reminder' (mobiCOMM) with:
      var 1 - name
      var 2 - date_today
    Can send to a single employee by user_id or phone, or all active employees missing check-in today.
    """
    client = get_client_for_user(user.token)
    date_str = body.date or get_ist_now().strftime("%d %b %Y")

    if body.phone:
        emp_name = body.name or "Team Member"
        ok, msg = send_checkin_reminder_template(body.phone, emp_name, date_str)
        return {"status": "sent" if ok else "failed", "detail": msg}

    if body.user_id:
        prof = client.table("profiles").select("id, full_name, phone").eq("id", body.user_id).execute().data
        if not prof or not prof[0].get("phone"):
            raise HTTPException(status_code=400, detail="Employee profile not found or phone number missing")
        emp_name = prof[0].get("full_name", "Team Member")
        ok, msg = send_checkin_reminder_template(prof[0]["phone"], emp_name, date_str)
        return {"status": "sent" if ok else "failed", "detail": msg}

    # Broadcast to all active employees who haven't checked in today
    today_str = get_ist_today_str()
    active_users = client.table("profiles").select("id, full_name, phone").eq("is_active", True).execute().data or []
    today_records = client.table("attendance_records").select("user_id").eq("date", today_str).execute().data or []
    checked_in_user_ids = {r["user_id"] for r in today_records}

    sent_count = 0
    for u in active_users:
        if u["id"] not in checked_in_user_ids and u.get("phone"):
            ok, _ = send_checkin_reminder_template(u["phone"], u.get("full_name", "Team Member"), date_str)
            if ok:
                sent_count += 1

    return {"status": "success", "reminders_sent": sent_count, "date": date_str}


def dispatch_daily_checkout_reminders(client=None) -> dict:
    """
    Finds all active employees who checked in today but haven't checked out yet,
    and sends them the 6:00 PM Check-Out prompt on WhatsApp.
    """
    if not client:
        client = get_admin_client() or supabase_anon

    today_str = get_ist_today_str()
    try:
        records = client.table("attendance_records") \
            .select("user_id, check_in_at, check_out_at, profiles(id, full_name, phone, is_active)") \
            .eq("date", today_str) \
            .not_.is_("check_in_at", "null") \
            .is_("check_out_at", "null") \
            .execute().data or []
    except Exception as e:
        logger.error(f"Error fetching checked-in employees for 6 PM reminder: {e}")
        try:
            records = client.table("attendance_records") \
                .select("user_id, check_in_at, check_out_at") \
                .eq("date", today_str) \
                .execute().data or []
            records = [r for r in records if r.get("check_in_at") and not r.get("check_out_at")]
        except Exception:
            records = []

    sent_count = 0
    errors = []

    for r in records:
        prof = r.get("profiles")
        user_id = r.get("user_id")
        if not prof and user_id:
            try:
                p_res = client.table("profiles").select("id, full_name, phone, is_active").eq("id", user_id).single().execute()
                prof = p_res.data
            except Exception:
                pass

        if not prof or prof.get("is_active") is False:
            continue

        phone = prof.get("phone")
        name = prof.get("full_name") or "Team Member"
        if not phone:
            continue

        try:
            ok = send_checkout_reminder_message(phone, name)
            if ok:
                sent_count += 1
                logger.info(f"6 PM Check-out reminder sent to {name} ({phone})")
        except Exception as send_err:
            errors.append(f"{name}: {send_err}")

    return {
        "status": "success",
        "date": today_str,
        "eligible_checked_in": len(records),
        "reminders_sent": sent_count,
        "errors": errors,
    }


@router.post("/send-checkout-reminder")
def trigger_checkout_reminder(
    user=Depends(require_hrms_manager_or_admin),
):
    """Manual trigger by manager or admin to dispatch 6 PM check-out reminders."""
    client = get_client_for_user(user.token)
    return dispatch_daily_checkout_reminders(client)


@router.get("/cron/checkout-reminder")
@router.post("/cron/checkout-reminder")
def cron_checkout_reminder(request: Request):
    """
    Public cron / Cloud Scheduler webhook endpoint to trigger 6:00 PM check-out reminders.
    Can be scheduled in Google Cloud Scheduler at 18:00 IST (12:30 UTC).
    """
    admin_client = get_admin_client() or supabase_anon
    return dispatch_daily_checkout_reminders(admin_client)


def dispatch_daily_checkin_reminders(client=None) -> dict:
    """
    Finds all active employees who haven't checked in yet today,
    and sends them the 9:00 AM Check-In prompt on WhatsApp.
    """
    if not client:
        client = get_admin_client() or supabase_anon

    today_str = get_ist_today_str()
    try:
        active_users = client.table("profiles").select("id, full_name, phone").eq("is_active", True).execute().data or []
        today_records = client.table("attendance_records").select("user_id").eq("date", today_str).execute().data or []
        checked_in_ids = {r["user_id"] for r in today_records}
    except Exception as e:
        logger.error(f"Error fetching profiles for 9 AM reminder: {e}")
        return {"status": "error", "error": str(e)}

    sent_count = 0
    errors = []

    for u in active_users:
        if u["id"] not in checked_in_ids and u.get("phone"):
            name = u.get("full_name") or "Team Member"
            phone = u["phone"]
            try:
                ok = send_checkin_prompt_message(phone, name)
                if ok:
                    sent_count += 1
                    logger.info(f"9 AM Check-in reminder sent to {name} ({phone})")
            except Exception as send_err:
                errors.append(f"{name}: {send_err}")

    return {
        "status": "success",
        "date": today_str,
        "eligible_missing_checkin": len(active_users) - len(checked_in_ids),
        "reminders_sent": sent_count,
        "errors": errors,
    }


@router.get("/cron/checkin-reminder")
@router.post("/cron/checkin-reminder")
def cron_checkin_reminder(request: Request):
    """
    Public cron / Cloud Scheduler webhook endpoint to trigger 9:00 AM check-in reminders.
    Can be scheduled in Google Cloud Scheduler at 09:00 IST (03:30 UTC).
    """
    admin_client = get_admin_client() or supabase_anon
    return dispatch_daily_checkin_reminders(admin_client)



