"""
routers/attendance.py  (rewritten)

Sections 1-3 : employee web check-in/out, team + report + export, sites/shifts  (unchanged behaviour)
Section 4    : WhatsApp webhook state machine
Section 5    : reminders (9:30 / 17:30) + auto check-out (19:00) + secured cron endpoints

WhatsApp rules (one check-in + one check-out per day):
  * The BUTTON / TEXT decides the intent (checkin | checkout | other).
  * A location pin only COMPLETES something that was explicitly started (pending_action).
    It never silently checks anyone out.
  * "hi" / random text never changes attendance state.
  * Reminders are sent at most once per user/day/kind (attendance_reminder_log).
  * Anyone still open at 19:00 is auto-checked-out.
  * Webhook retries are de-duplicated by WhatsApp message id.

Requires attendance_state_migration.sql to be applied.
"""
import os
import io
import re
import csv
import hmac
import json
import logging
from calendar import monthrange
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
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
    send_checkout_reminder_template,
    normalize_phone,
    extract_whatsapp_message,
    WHATSAPP_VERIFY_TOKEN,
)

logger = logging.getLogger("attendance_router")
router = APIRouter(prefix="/hrms/attendance", tags=["flowwies-attendance"])

# IST timezone (UTC+5:30) for accurate local dates and times
IST = timezone(timedelta(hours=5, minutes=30))

# ---- behaviour switches -------------------------------------------------
# False: attendance is recorded when "Check-In" is tapped (location verifies it later).
# True : attendance is recorded only when the location pin arrives.
REQUIRE_LOCATION_FOR_CHECKIN = False
# A "share location to check out" request stays valid for this long.
PENDING_LOCATION_TTL_MIN = 60
# Mon=0 ... Sun=6. Add 5 for Saturday off.
WEEKOFF_WEEKDAYS = {6}

CHECKIN_WORDS = {"IN", "CHECKIN", "CHECK IN", "CHECK-IN", "CHECK_IN", "BTN_CHECKIN", "PUNCH IN", "START", "PRESENT"}
CHECKOUT_WORDS = {"OUT", "CHECKOUT", "CHECK OUT", "CHECK-OUT", "CHECK_OUT", "BTN_CHECKOUT", "PUNCH OUT", "LEAVE", "EXIT", "BYE"}
ACKNOWLEDGMENT_WORDS = {"OK", "OKAY", "K", "THANKS", "THANK YOU", "THX", "TY", "NOTED", "GOT IT", "SURE", "FINE", "COOL", "YES", "YUP", "YEP", "THUMBS UP", "NICE", "SUPER", "LIKE"}

# Fallback default Alt.F Coworking coordinates (Noida / Gurgaon / Delhi NCR standard)
DEFAULT_ALT_F_COORDINATES = {
    "name": "Alt.F Coworking",
    "address": "Alt.F Coworking, Sector 142 / Golf Course Road, Delhi NCR",
    "latitude": 28.5034,
    "longitude": 77.4054,
    "radius_meters": 200,
}


# =========================================================================
# Shared helpers
# =========================================================================

def get_ist_now() -> datetime:
    return datetime.now(IST)


def get_ist_today_str() -> str:
    return get_ist_now().strftime("%Y-%m-%d")


def get_month_date_range(month_str: str) -> tuple:
    """'YYYY-MM' -> (first_day, last_day) with the real last day of that month."""
    try:
        parts = month_str.strip().split("-")
        year, month = int(parts[0]), int(parts[1])
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
        if res.data:
            return res.data[0]

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
        any_shift = client.table("attendance_shifts").select("*").limit(1).execute()
        if any_shift.data:
            return any_shift.data[0]
    except Exception:
        pass
    return {"id": None, "name": "General", "start_time": "09:00:00", "end_time": "18:00:00", "grace_minutes": 15}


def check_geofence_with_postgis(client, lat: float, lng: float, site_id: str) -> bool:
    """PostGIS RPC from migration 012, with a Haversine fallback."""
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

    try:
        site_res = client.table("attendance_sites").select("*").eq("id", site_id).execute()
        if site_res.data:
            import math
            site = site_res.data[0]
            R = 6371000
            phi1, phi2 = math.radians(lat), math.radians(site["latitude"])
            dphi = math.radians(site["latitude"] - lat)
            dlam = math.radians(site["longitude"] - lng)
            a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
            dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return dist <= float(site.get("radius_meters", 200))
    except Exception:
        pass
    return False


def is_checkin_late(shift: dict, check_in_dt: datetime) -> bool:
    try:
        st_parts = str(shift.get("start_time", "09:00:00")).split(":")
        threshold = int(st_parts[0]) * 60 + int(st_parts[1]) + int(shift.get("grace_minutes", 15))
        return (check_in_dt.hour * 60 + check_in_dt.minute) > threshold
    except Exception:
        return False


def _to_ist(iso: str) -> datetime:
    return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(IST)


def _fmt_time(iso) -> str:
    try:
        return _to_ist(iso).strftime("%I:%M %p")
    except Exception:
        return str(iso)


def _hours_between(in_iso, out_dt: datetime):
    try:
        secs = (out_dt.astimezone(timezone.utc) - _to_ist(in_iso).astimezone(timezone.utc)).total_seconds()
        return round(max(0.0, secs / 3600.0), 2)
    except Exception:
        return None


def _is_dup_error(e: Exception) -> bool:
    s = str(e).lower()
    return "23505" in s or "duplicate" in s or "unique" in s


# =========================================================================
# 1. EMPLOYEE ATTENDANCE ENDPOINTS (web app)
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

    leave = client.table("leave_requests") \
        .select("*") \
        .eq("user_id", user.id) \
        .eq("status", "approved") \
        .lte("start_date", today_str) \
        .gte("end_date", today_str) \
        .execute()
    is_on_leave = bool(leave.data)
    leave_info = leave.data[0] if is_on_leave else None

    holiday = client.table("company_holidays").select("*").eq("holiday_date", today_str).execute()
    is_holiday = bool(holiday.data)
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

    existing = client.table("attendance_records") \
        .select("*").eq("user_id", user.id).eq("date", today_str).execute()

    if existing.data and existing.data[0].get("check_in_at"):
        raise HTTPException(status_code=400, detail="You have already checked in for today.")

    site = ensure_default_site(client)
    site_id = site.get("id")
    within_geofence = check_geofence_with_postgis(client, body.latitude, body.longitude, site_id) if site_id else False

    shift = get_default_shift(client)
    late_flag = is_checkin_late(shift, ist_now)

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
        "location_verified": True,   # web check-in always carries coordinates
        "pending_action": None,
        "pending_action_at": None,
    }

    if existing.data:
        res = client.table("attendance_records").update(rec_payload).eq("id", existing.data[0]["id"]).execute()
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

    existing = client.table("attendance_records") \
        .select("*").eq("user_id", user.id).eq("date", today_str).execute()

    if not existing.data or not existing.data[0].get("check_in_at"):
        raise HTTPException(status_code=400, detail="Cannot check out without checking in first.")

    rec = existing.data[0]
    if rec.get("check_out_at"):
        raise HTTPException(status_code=400, detail="You have already checked out for today.")

    site_id = rec.get("site_id")
    within_geofence = False
    if body.latitude and body.longitude and site_id:
        within_geofence = check_geofence_with_postgis(client, body.latitude, body.longitude, site_id)

    work_hours = _hours_between(rec.get("check_in_at"), ist_now)

    upd_payload = {
        "check_out_at": ist_now.isoformat(),
        "check_out_latitude": body.latitude,
        "check_out_longitude": body.longitude,
        "check_out_within_geofence": within_geofence,
        "status": "checked_out",
        "work_hours": work_hours,
        "pending_action": None,
        "pending_action_at": None,
    }
    if body.notes:
        existing_notes = rec.get("notes") or ""
        upd_payload["notes"] = f"{existing_notes}\nOut: {body.notes}".strip()

    res = client.table("attendance_records").update(upd_payload).eq("id", rec["id"]).execute()
    saved = res.data[0] if res.data else upd_payload
    return {"status": "checked_out", "record": saved, "work_hours": work_hours}


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
        return query.execute().data or []
    except Exception as e:
        logger.warning(f"Error fetching attendance history: {e}")
        try:
            plain = client.table("attendance_records").select("*") \
                .eq("user_id", user.id).order("date", desc=True).limit(limit)
            if month:
                start_date, end_date = get_month_date_range(month)
                plain = plain.gte("date", start_date).lte("date", end_date)
            return plain.execute().data or []
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

    employees = []
    emp_cols = "id, full_name, email, emp_code, department, phone, avatar_color, is_active"
    try:
        employees = client.table("profiles").select(emp_cols).eq("is_active", True).order("full_name").execute().data or []
    except Exception as e:
        logger.error(f"Error fetching profiles for /team: {e}")
        try:
            admin_client = get_admin_client() or supabase_anon
            employees = admin_client.table("profiles").select(emp_cols).eq("is_active", True).order("full_name").execute().data or []
        except Exception:
            pass

    records = []
    try:
        records = client.table("attendance_records").select("*, attendance_sites(name)").eq("date", date_str).execute().data or []
    except Exception as e:
        logger.warning(f"attendance_sites embed warning: {e}, falling back to plain select")
        try:
            records = client.table("attendance_records").select("*").eq("date", date_str).execute().data or []
        except Exception as e2:
            logger.error(f"Failed to fetch attendance records: {e2}")

    rec_by_user = {r["user_id"]: r for r in records if "user_id" in r}

    # Do NOT embed profiles - leave_requests has 2 foreign keys to profiles (PGRST201)
    leaves = []
    try:
        leaves = client.table("leave_requests").select("*").eq("status", "approved") \
            .lte("start_date", date_str).gte("end_date", date_str).execute().data or []
    except Exception as e:
        logger.warning(f"Error fetching leave_requests for /team: {e}")
    leave_by_user = {l["user_id"]: l for l in leaves if "user_id" in l}

    holiday = []
    try:
        holiday = client.table("company_holidays").select("*").eq("holiday_date", date_str).execute().data or []
    except Exception as e:
        logger.warning(f"Error fetching company_holidays for /team: {e}")

    team_status = []
    present_count = late_count = on_leave_count = absent_count = 0

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

        team_status.append({"employee": emp, "record": rec, "leave": leave, "status": computed_status})

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

    prof_cols = "id, full_name, email, department, emp_code"
    profiles = []
    try:
        profiles = client.table("profiles").select(prof_cols).eq("is_active", True).execute().data or []
    except Exception as e:
        logger.error(f"Error fetching profiles for /report: {e}")
        try:
            admin_client = get_admin_client() or supabase_anon
            profiles = admin_client.table("profiles").select(prof_cols).eq("is_active", True).execute().data or []
        except Exception:
            pass

    records = []
    try:
        records = client.table("attendance_records").select("*").gte("date", start_date).lte("date", end_date).execute().data or []
    except Exception as e:
        logger.error(f"Error fetching attendance_records for /report: {e}")

    leaves = []
    try:
        leaves = client.table("leave_requests").select("*").eq("status", "approved") \
            .gte("end_date", start_date).lte("start_date", end_date).execute().data or []
    except Exception as e:
        logger.error(f"Error fetching leave_requests for /report: {e}")

    holidays = []
    try:
        holidays = client.table("company_holidays").select("*") \
            .gte("holiday_date", start_date).lte("holiday_date", end_date).execute().data or []
    except Exception as e:
        logger.error(f"Error fetching company_holidays for /report: {e}")

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
            "auto_checkout_days": sum(1 for r in emp_records if r.get("auto_checked_out")),
        })

    return {"month": month, "total_holidays": len(holidays), "holidays": holidays, "employees": report_rows}


def sanitize_csv_cell(value):
    """Neutralises CSV/formula injection (CWE-1236)."""
    if value is None:
        return ""
    val_str = str(value)
    if val_str and val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val_str}"
    return val_str


@router.get("/export")
def export_attendance_csv(
    month: str = Query(..., description="Format: YYYY-MM"),
    user=Depends(require_hrms_manager_or_admin),
):
    client = get_client_for_user(user.token)
    start_date, end_date = get_month_date_range(month)

    base_cols = "date, check_in_at, check_out_at, work_hours, is_late, check_in_within_geofence, check_in_source, location_verified, auto_checked_out"
    records = []
    try:
        records = client.table("attendance_records") \
            .select(f"{base_cols}, profiles(full_name, email, emp_code, department)") \
            .gte("date", start_date).lte("date", end_date).order("date", desc=True).execute().data or []
    except Exception as e:
        logger.warning(f"Export query with profiles embed failed: {e}, falling back to plain select")
        try:
            records = client.table("attendance_records").select(f"{base_cols}, user_id") \
                .gte("date", start_date).lte("date", end_date).order("date", desc=True).execute().data or []
        except Exception:
            records = []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Employee Name", "Email", "Emp Code", "Department",
        "Check-In Time", "Check-Out Time", "Work Hours", "Is Late",
        "Within Geo-Fence", "Location Verified", "Auto Check-Out", "Source",
    ])

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
            "Yes" if r.get("location_verified") else "No",
            "Yes" if r.get("auto_checked_out") else "No",
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
    return client.table("attendance_sites").select("*").eq("is_active", True).order("created_at").execute().data or []


@router.post("/sites")
def create_site(body: SiteCreate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    res = client.table("attendance_sites").insert(body.model_dump()).execute()
    return res.data[0] if res.data else {"status": "created"}


@router.patch("/sites/{site_id}")
def update_site(site_id: str, body: SiteUpdate, user=Depends(require_hrms_manager)):
    client = get_client_for_user(user.token)
    res = client.table("attendance_sites").update(body.model_dump(exclude_unset=True)).eq("id", site_id).execute()
    return res.data[0] if res.data else {"status": "updated"}


@router.get("/shifts")
def list_shifts(user=Depends(get_current_user)):
    client = get_client_for_user(user.token)
    return client.table("attendance_shifts").select("*").order("name").execute().data or []


# =========================================================================
# 4. WHATSAPP WEBHOOK
# =========================================================================

def handle_whatsapp_webhook_verification(request: Request):
    """GET handshake for Meta Cloud API / mobiCOMM."""
    params = request.query_params
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge") or params.get("challenge")

    if challenge:
        if token and token != WHATSAPP_VERIFY_TOKEN:
            logger.warning("WhatsApp webhook verification failed (bad token)")
            raise HTTPException(status_code=403, detail="Invalid verification token")
        return PlainTextResponse(content=str(challenge), status_code=200)

    return {"status": "ok", "message": "WhatsApp webhook endpoint is active and listening"}


def detect_intent(text: str, has_location: bool) -> str:
    """location | checkin | checkout | ack | other."""
    if has_location:
        return "location"
    raw = (text or "").strip()
    t = re.sub(r"[^A-Z_\- ]", "", raw.upper())
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        # Pure emojis (👍, ❤️, 🙏) or empty -> acknowledgment / reaction, not a command
        return "ack" if raw else "other"
    words = set(t.split())
    if t in CHECKOUT_WORDS or "CHECKOUT" in words or "CHECK-OUT" in words or "OUT" in words or t.startswith("CHECK OUT") or t.startswith("CHECK-OUT"):
        return "checkout"
    if t in CHECKIN_WORDS or "CHECKIN" in words or "CHECK-IN" in words or "IN" in words or t.startswith("CHECK IN") or t.startswith("CHECK-IN"):
        return "checkin"
    if t in ACKNOWLEDGMENT_WORDS:
        return "ack"
    return "other"


def already_processed(client, message_id) -> bool:
    """Providers retry webhooks; insert-or-fail on the message id makes processing idempotent."""
    if not message_id:
        return False
    try:
        client.table("whatsapp_processed_messages").insert({"message_id": str(message_id)}).execute()
        return False
    except Exception as e:
        if _is_dup_error(e):
            return True
        logger.warning(f"dedupe table problem (continuing): {e}")
        return False


def find_employee_by_phone(client, norm: str):
    """
    Match sender phone to a profile. emergency_contact_phone is deliberately NOT matched:
    a relative must not be able to punch an employee in.
    """
    cols = "id, full_name, email, phone, is_active"
    try:
        r = client.rpc("get_profile_by_phone", {"phone_query": norm}).execute()
        if r.data:
            return r.data[0]
    except Exception as e:
        logger.info(f"get_profile_by_phone rpc: {e}")
    try:
        for p in client.table("profiles").select(cols).ilike("phone", f"%{norm}%").execute().data or []:
            if normalize_phone(p.get("phone")) == norm:
                return p
    except Exception as e:
        logger.info(f"profiles ilike lookup: {e}")
    try:  # last resort for phones stored like "+91 98765-43210"
        for p in client.table("profiles").select(cols).execute().data or []:
            if normalize_phone(p.get("phone")) == norm:
                return p
    except Exception as e:
        logger.error(f"profiles scan: {e}")
    return None


def _update_record(client, rec_id, data):
    try:
        return client.table("attendance_records").update(data).eq("id", rec_id).execute().data
    except Exception as e:
        logger.error(f"attendance update failed: {e}")
        return None


def record_attendance_in_supabase(client, user_id: str, today_str: str, check_in_iso: str,
                                  lat: float = None, lng: float = None, within_fence: bool = False,
                                  is_late: bool = False, site_id: str = None, shift_id: str = None):
    """Check-in write. SECURITY DEFINER RPC first (works with anon key), direct table write as fallback."""
    try:
        res = client.rpc("record_whatsapp_punch", {
            "p_user_id": str(user_id),
            "p_date": today_str,
            "p_check_in_at": check_in_iso,
            "p_lat": float(lat) if lat is not None else None,
            "p_lng": float(lng) if lng is not None else None,
            "p_within_fence": bool(within_fence),
            "p_is_late": bool(is_late),
            "p_site_id": str(site_id) if site_id else None,
        }).execute()
        if res.data and isinstance(res.data, dict) and "record" in res.data:
            return res.data.get("record")
    except Exception as rpc_e:
        logger.info(f"record_whatsapp_punch rpc fallback: {rpc_e}")

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
        existing = client.table("attendance_records").select("id, check_in_at").eq("user_id", user_id).eq("date", today_str).execute().data
        if existing:
            if existing[0].get("check_in_at"):
                return existing[0]          # never overwrite an existing check-in time
            res = client.table("attendance_records").update(rec_payload).eq("id", existing[0]["id"]).execute()
        else:
            res = client.table("attendance_records").insert(rec_payload).execute()
        if res.data:
            return res.data[0]
    except Exception as table_e:
        logger.error(f"Direct attendance write failed: {table_e}")
    return rec_payload


def _do_checkin(client, user_id, today_str, ist_now, lat, lng, within, site_id, shift):
    late = is_checkin_late(shift, ist_now)
    saved = record_attendance_in_supabase(
        client, user_id=user_id, today_str=today_str, check_in_iso=ist_now.isoformat(),
        lat=lat, lng=lng, within_fence=within, is_late=late,
        site_id=site_id, shift_id=shift.get("id") if shift else None,
    )
    verified = lat is not None
    try:
        client.table("attendance_records").update({
            "location_verified": verified,
            "pending_action": None if verified else "checkin",
            "pending_action_at": None if verified else ist_now.isoformat(),
        }).eq("user_id", user_id).eq("date", today_str).execute()
    except Exception as e:
        logger.error(f"could not set verification state: {e}")
    return saved, late


def _do_checkout(client, rec, ist_now, lat, lng, within):
    hours = _hours_between(rec.get("check_in_at"), ist_now)
    _update_record(client, rec["id"], {
        "check_out_at": ist_now.isoformat(),
        "check_out_latitude": lat,
        "check_out_longitude": lng,
        "check_out_within_geofence": within,
        "status": "checked_out",
        "work_hours": hours,
        "pending_action": None,
        "pending_action_at": None,
    })
    return hours


def process_whatsapp_event(payload: dict) -> dict:
    """Blocking worker (runs in a threadpool). One incoming WhatsApp event -> state change + reply."""
    msg_info = extract_whatsapp_message(payload)
    if not msg_info:
        return {"status": "received"}

    from_phone = msg_info.get("from_phone")
    if not from_phone:
        return {"status": "ignored_no_sender"}

    client = get_admin_client() or supabase_anon
    if not client:
        logger.error("No Supabase client available for WhatsApp webhook")
        return {"status": "db_client_unavailable"}

    if already_processed(client, msg_info.get("message_id")):
        return {"status": "duplicate_ignored"}

    norm = normalize_phone(from_phone)
    lat, lng = msg_info.get("latitude"), msg_info.get("longitude")
    has_loc = lat is not None and lng is not None
    intent = detect_intent(msg_info.get("text") or "", has_loc)
    logger.info(f"WA event from {norm}: intent={intent} text={msg_info.get('text')!r}")

    user = find_employee_by_phone(client, norm)
    if not user:
        logger.warning(f"Unregistered phone {from_phone} (norm: {norm}) attempted to punch in")
        send_whatsapp_message(
            from_phone,
            f"⚠️ Your WhatsApp number (*{from_phone}*) is not registered in Flowwies HRMS.\n\n"
            f"Please check that this exact number is added to your profile in the *People & Access* tab in Flowwies.",
        )
        return {"status": "user_not_found", "phone": from_phone}

    if user.get("is_active") is False:
        logger.warning(f"Inactive user {user.get('full_name')} attempted WhatsApp attendance from {from_phone}")
        send_whatsapp_message(
            from_phone,
            f"⚠️ Your Flowwies HRMS account for *{user.get('full_name')}* is currently deactivated.\n"
            f"Please contact HR to reactivate your account.",
        )
        return {"status": "user_inactive", "phone": from_phone}

    user_id, name = user["id"], user.get("full_name") or "Team Member"
    ist_now, today_str = get_ist_now(), get_ist_today_str()
    time_str = ist_now.strftime("%I:%M %p")

    rows = []
    try:
        rows = client.table("attendance_records").select("*").eq("user_id", user_id).eq("date", today_str).execute().data or []
    except Exception as e:
        logger.warning(f"record lookup: {e}")
    rec = rows[0] if rows else None
    checked_in = bool(rec and rec.get("check_in_at"))
    checked_out = bool(rec and rec.get("check_out_at"))

    site = ensure_default_site(client)
    site_id = site.get("id") if site else None
    site_name = (site or {}).get("name", "Alt.F Coworking")
    shift = get_default_shift(client)

    def fence(la, ln):
        return check_geofence_with_postgis(client, float(la), float(ln), site_id) if site_id else False

    def fence_msg(ok):
        return f"✅ Inside {site_name} geo-fence." if ok else f"⚠️ Outside office radius of {site_name}."

    def say_done():
        hrs = rec.get("work_hours")
        extra = f"\n⏱️ Work duration: *{hrs} hours*" if hrs is not None else ""
        send_whatsapp_message(
            from_phone,
            f"Hi {name}, you're all done for today. Checked out at {_fmt_time(rec.get('check_out_at'))}.{extra}\n"
            f"See you tomorrow! 🌟",
        )
        return {"status": "already_checked_out"}

    # ------------------------- LOCATION PIN -------------------------
    if intent == "location":
        within = fence(lat, lng)

        if checked_out:
            return say_done()

        if not checked_in:  # pin arrived first -> it is a check-in
            _, late = _do_checkin(client, user_id, today_str, ist_now, float(lat), float(lng), within, site_id, shift)
            send_whatsapp_message(
                from_phone,
                f"✅ Good morning {name}! Check-in recorded at {time_str}{' (Late)' if late else ''}.\n"
                f"{fence_msg(within)}\n\nWe'll remind you at 5:30 PM to check out. 🚀",
            )
            return {"status": "check_in_recorded", "within_geofence": within}

        fresh = False
        if rec.get("pending_action_at"):
            try:
                fresh = (ist_now - _to_ist(rec["pending_action_at"])) <= timedelta(minutes=PENDING_LOCATION_TTL_MIN)
            except Exception:
                fresh = False

        if rec.get("pending_action") == "checkout" and fresh:
            hours = _do_checkout(client, rec, ist_now, float(lat), float(lng), within)
            send_whatsapp_message(
                from_phone,
                f"👋 Bye {name}! Check-out recorded at {time_str}.\n"
                f"⏱️ Work duration: *{hours} hours*\n{fence_msg(within)}\n\nHave a great evening! 🌟",
            )
            return {"status": "checked_out", "work_hours": hours, "within_geofence": within}

        if not rec.get("location_verified"):  # location for the earlier, unverified check-in
            _update_record(client, rec["id"], {
                "check_in_latitude": float(lat), "check_in_longitude": float(lng),
                "check_in_within_geofence": within, "location_verified": True,
                "pending_action": None, "pending_action_at": None,
            })
            send_whatsapp_message(
                from_phone,
                f"📍 Location verified for your {_fmt_time(rec['check_in_at'])} check-in.\n{fence_msg(within)}",
            )
            return {"status": "location_verified", "within_geofence": within}

        # Checked in and location is already verified, but check-out was NOT requested -> do not checkout
        send_whatsapp_message(
            from_phone,
            f"✅ Hi {name}, you're already checked in today ({_fmt_time(rec['check_in_at'])}).\n"
            f"To check out, please reply *OUT* when leaving.",
        )
        return {"status": "location_ignored_not_requested"}

    # ------------------------- ACKNOWLEDGMENT / EMOJI -------------------------
    if intent == "ack":
        # Ignore emojis (👍, ❤️, 🙏) and acknowledgments ("ok", "thanks") — do not trigger check-out
        return {"status": "ack_ignored"}

    # ------------------------- CHECK-IN -------------------------
    if intent == "checkin":
        if checked_out:
            return say_done()

        if checked_in:
            send_whatsapp_message(
                from_phone,
                f"✅ Hi {name}, you're already checked in today ({_fmt_time(rec['check_in_at'])}).\n"
                f"Reply 'OUT' when leaving to end your shift! 🚀",
            )
            return {"status": "already_checked_in"}

        if REQUIRE_LOCATION_FOR_CHECKIN:
            send_location_request_message(from_phone, f"📍 Hi {name}, share your location to complete check-in at {site_name}.")
            return {"status": "checkin_location_requested"}

        _, late = _do_checkin(client, user_id, today_str, ist_now, None, None, False, site_id, shift)
        send_location_request_message(
            from_phone,
            f"✅ {name}, check-in recorded at {time_str}{' (Late)' if late else ''}.\n"
            f"📍 Tap below to share your location and verify it at {site_name}.",
        )
        return {"status": "check_in_recorded", "verified": False}

    # ------------------------- CHECK-OUT -------------------------
    if intent == "checkout":
        if not checked_in:
            send_whatsapp_message(
                from_phone,
                f"Hi {name}, you haven't checked in yet today, so there's nothing to check out of.\n"
                f"Please tap *Check-In* (or reply *IN*) first.",
            )
            return {"status": "not_checked_in"}
        if checked_out:
            return say_done()
        _update_record(client, rec["id"], {"pending_action": "checkout", "pending_action_at": ist_now.isoformat()})
        send_location_request_message(
            from_phone,
            f"👋 Hi {name}! Wrapping up your shift? Please tap the button below to share your current location and verify your check-out at {site_name}.",
        )
        return {"status": "checkout_location_requested"}

    # ------------------------- ANYTHING ELSE -------------------------
    if checked_out:
        return say_done()
    if checked_in:
        hours_worked = _hours_between(rec.get("check_in_at"), ist_now) or 0.0
        # If in the morning or checked in less than 1 hour ago: do NOT trigger check-out!
        if hours_worked < 1.0 or ist_now.hour < 13:
            send_whatsapp_message(
                from_phone,
                f"✅ Hi {name}! You're checked in today ({_fmt_time(rec['check_in_at'])}).\n"
                f"Have a productive day! 🚀 Reply *OUT* when leaving to end your shift.",
            )
            return {"status": "info_checked_in"}

        # Afternoon / evening follow-up (> 1 hr after check-in): trigger check-out flow
        _update_record(client, rec["id"], {"pending_action": "checkout", "pending_action_at": ist_now.isoformat()})
        send_location_request_message(
            from_phone,
            f"👋 Hi {name}! Wrapping up your shift? Please tap the button below to share your current location and verify your check-out at {site_name}.",
        )
        return {"status": "checkout_location_requested"}

    send_checkin_prompt_message(from_phone, name)
    return {"status": "checkin_prompt_sent"}


async def handle_incoming_whatsapp_webhook(request: Request):
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not verify_meta_signature(body_bytes, signature):
        return Response(content="Invalid or missing signature", status_code=403)

    # Relay (mobiCOMM) calls carry no Meta signature. If WHATSAPP_RELAY_TOKEN is set, require it
    # (header X-Webhook-Token or ?token=...) so strangers cannot forge attendance events.
    relay_token = (os.environ.get("WHATSAPP_RELAY_TOKEN") or "").strip()
    if relay_token and not signature:
        supplied = request.headers.get("X-Webhook-Token") or request.query_params.get("token") or ""
        if not hmac.compare_digest(supplied, relay_token):
            logger.warning("WhatsApp relay webhook rejected: bad/missing relay token")
            return Response(content="Forbidden", status_code=403)

    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace")) if body_bytes else {}
    except Exception:
        return Response(content="Bad JSON", status_code=400)

    logger.info(f"Incoming WhatsApp webhook: {str(payload)[:1500]}")
    try:
        # supabase + requests are blocking; keep them off the event loop
        return await run_in_threadpool(process_whatsapp_event, payload)
    except Exception as e:
        logger.exception(f"WhatsApp webhook processing failed: {e}")
        return {"status": "error"}   # 200 so the provider does not retry-storm


@router.get("/webhook")
def attendance_webhook_get(request: Request):
    return handle_whatsapp_webhook_verification(request)


@router.post("/webhook")
async def attendance_webhook_post(request: Request):
    return await handle_incoming_whatsapp_webhook(request)


# =========================================================================
# 5. REMINDERS, AUTO CHECK-OUT, CRON
# =========================================================================

@router.post("/send-checkin-reminder")
def trigger_checkin_reminder(
    body: CheckinReminderRequest,
    user=Depends(require_hrms_manager_or_admin),
):
    """Manager-triggered template reminder: one employee (user_id / phone) or everyone still missing check-in."""
    client = get_client_for_user(user.token)
    date_str = body.date or get_ist_now().strftime("%d %b %Y")

    if body.phone:
        ok, msg = send_checkin_reminder_template(body.phone, body.name or "Team Member", date_str)
        return {"status": "sent" if ok else "failed", "detail": msg}

    if body.user_id:
        prof = client.table("profiles").select("id, full_name, phone").eq("id", body.user_id).execute().data
        if not prof or not prof[0].get("phone"):
            raise HTTPException(status_code=400, detail="Employee profile not found or phone number missing")
        ok, msg = send_checkin_reminder_template(prof[0]["phone"], prof[0].get("full_name", "Team Member"), date_str)
        return {"status": "sent" if ok else "failed", "detail": msg}

    return dispatch_daily_checkin_reminders(client, force=True)


def _cron_guard(request: Request):
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    given = request.headers.get("X-Cron-Secret", "") or request.query_params.get("cron_secret", "")
    if secret:
        if not given or not hmac.compare_digest(given, secret):
            raise HTTPException(status_code=403, detail="Forbidden")


def _non_working_day(client, today_str):
    if get_ist_now().weekday() in WEEKOFF_WEEKDAYS:
        return "weekly_off"
    try:
        if client.table("company_holidays").select("*").eq("holiday_date", today_str).execute().data:
            return "holiday"
    except Exception as e:
        logger.warning(f"holiday lookup: {e}")
    return None


def _users_on_leave(client, today_str) -> set:
    try:
        rows = client.table("leave_requests").select("user_id").eq("status", "approved") \
            .lte("start_date", today_str).gte("end_date", today_str).execute().data or []
        return {r["user_id"] for r in rows}
    except Exception:
        return set()


def _claim_reminder(client, kind, user_id, date_str) -> bool:
    """True only for the first caller per (date, kind, user). Fails CLOSED so a missing table cannot cause spam."""
    try:
        client.table("attendance_reminder_log").insert(
            {"reminder_date": date_str, "kind": kind, "user_id": user_id}).execute()
        return True
    except Exception as e:
        if not _is_dup_error(e):
            logger.error(f"attendance_reminder_log error (did you run the migration?): {e}")
        return False


def _release_reminder(client, kind, user_id, date_str):
    try:
        client.table("attendance_reminder_log").delete() \
            .eq("reminder_date", date_str).eq("kind", kind).eq("user_id", user_id).execute()
    except Exception:
        pass


def _fetch_active_profiles(client) -> list:
    """Fetches active employee contacts via RPC first (works with anon key), direct table select as fallback."""
    try:
        r = client.rpc("get_active_employees_for_attendance").execute()
        if r.data:
            return r.data
    except Exception as e:
        logger.info(f"get_active_employees_for_attendance rpc: {e}")
    try:
        return client.table("profiles").select("id, full_name, phone").eq("is_active", True).execute().data or []
    except Exception as e:
        logger.error(f"profiles select failed: {e}")
        return []


def dispatch_daily_checkin_reminders(client=None, force: bool = False) -> dict:
    """09:30 IST. Template (works outside the 24h window) with a Check-In quick-reply button."""
    client = client or get_admin_client() or supabase_anon
    today = get_ist_today_str()

    if not force:
        skip = _non_working_day(client, today)
        if skip:
            return {"status": "skipped", "reason": skip}

    users = _fetch_active_profiles(client)
    done = client.table("attendance_records").select("user_id, check_in_at").eq("date", today).execute().data or []
    checked_in = {r["user_id"] for r in done if r.get("check_in_at")}
    on_leave = _users_on_leave(client, today)

    sent, already, errors = 0, 0, []
    for u in users:
        if u["id"] in checked_in or u["id"] in on_leave or not u.get("phone"):
            continue
        if not _claim_reminder(client, "checkin", u["id"], today):
            already += 1
            continue
        name = u.get("full_name") or "Team Member"
        try:
            ok, _ = send_checkin_reminder_template(u["phone"], name)
            if ok:
                sent += 1
            else:
                _release_reminder(client, "checkin", u["id"], today)
                errors.append(f"{name}: send failed")
        except Exception as e:
            _release_reminder(client, "checkin", u["id"], today)
            errors.append(f"{name}: {e}")

    return {"status": "success", "date": today, "reminders_sent": sent, "already_sent": already, "errors": errors}


def dispatch_daily_checkout_reminders(client=None) -> dict:
    """17:30 IST. Only people who checked in and have not checked out."""
    client = client or get_admin_client() or supabase_anon
    today = get_ist_today_str()

    open_recs = client.table("attendance_records").select("user_id, check_in_at, check_out_at") \
        .eq("date", today).not_.is_("check_in_at", "null").is_("check_out_at", "null").execute().data or []
    ids = [r["user_id"] for r in open_recs]

    profs = {}
    if ids:
        try:
            for p in client.table("profiles").select("id, full_name, phone, is_active").in_("id", ids).execute().data or []:
                profs[p["id"]] = p
        except Exception:
            pass
        if not profs:
            for p in _fetch_active_profiles(client):
                if p.get("id") in ids:
                    profs[p["id"]] = p

    sent, already, errors = 0, 0, []
    for uid in ids:
        p = profs.get(uid) or {}
        if p.get("is_active") is False or not p.get("phone"):
            continue
        if not _claim_reminder(client, "checkout", uid, today):
            already += 1
            continue
        name = p.get("full_name") or "Team Member"
        try:
            ok, _ = send_checkout_reminder_template(p["phone"], name)
            if not ok:
                ok = send_checkout_reminder_message(p["phone"], name)
            if ok:
                sent += 1
            else:
                _release_reminder(client, "checkout", uid, today)
                errors.append(f"{name}: send failed")
        except Exception as e:
            _release_reminder(client, "checkout", uid, today)
            errors.append(f"{name}: {e}")

    return {"status": "success", "date": today, "eligible": len(ids), "reminders_sent": sent,
            "already_sent": already, "errors": errors}


def auto_checkout_open_records(client=None) -> dict:
    """
    Auto-closes unclosed shifts (either from today or from previous days like yesterday).
    Runs at 7:00 AM IST (to close yesterday's missed checkouts) or 19:00/20:00 IST.
    """
    client = client or get_admin_client() or supabase_anon
    now = get_ist_now()
    today = get_ist_today_str()

    shift = get_default_shift(client)
    try:
        eh, em = [int(x) for x in str(shift.get("end_time", "18:00:00")).split(":")[:2]]
    except Exception:
        eh, em = 18, 0

    open_recs = client.table("attendance_records").select("id, user_id, date, check_in_at") \
        .lte("date", today).not_.is_("check_in_at", "null").is_("check_out_at", "null").execute().data or []

    closed = 0
    for r in open_recs:
        rec_date_str = r.get("date") or today
        try:
            rec_y, rec_m, rec_d = [int(x) for x in rec_date_str.split("-")[:3]]
            shift_end_for_rec = now.replace(year=rec_y, month=rec_m, day=rec_d, hour=eh, minute=em, second=0, microsecond=0)
        except Exception:
            shift_end_for_rec = now.replace(hour=eh, minute=em, second=0, microsecond=0)

        try:
            in_dt = _to_ist(r["check_in_at"])
        except Exception:
            in_dt = None
        out_dt = shift_end_for_rec if (in_dt and in_dt < shift_end_for_rec) else now

        upd = _update_record(client, r["id"], {
            "check_out_at": out_dt.isoformat(),
            "status": "checked_out",
            "work_hours": _hours_between(r["check_in_at"], out_dt),
            "auto_checked_out": True,
            "pending_action": None,
            "pending_action_at": None,
        })
        if upd is None:
            continue
        closed += 1

        p = None
        try:
            p = client.table("profiles").select("full_name, phone").eq("id", r["user_id"]).single().execute().data
        except Exception:
            p = None
        if not p:
            for ap in _fetch_active_profiles(client):
                if ap.get("id") == r["user_id"]:
                    p = ap
                    break
        try:
            if p and p.get("phone"):
                date_label = f"yesterday ({rec_date_str})" if rec_date_str < today else "today"
                send_whatsapp_message(
                    p["phone"],
                    f"Hi {p.get('full_name') or ''}, you didn't check out {date_label}, so your shift was automatically "
                    f"closed at {out_dt.strftime('%I:%M %p')}. If that's wrong, please tell HR.",
                )
        except Exception:
            pass

    return {"status": "success", "date": today, "auto_checked_out": closed}


@router.post("/send-checkout-reminder")
def trigger_checkout_reminder(user=Depends(require_hrms_manager_or_admin)):
    """Manual trigger by manager/admin."""
    return dispatch_daily_checkout_reminders(get_client_for_user(user.token))


# Cloud Scheduler (time zone Asia/Kolkata, header  X-Cron-Secret: <CRON_SECRET>):
#   30 9  * * 1-6  ->  /hrms/attendance/cron/checkin-reminder
#   30 17 * * 1-6  ->  /hrms/attendance/cron/checkout-reminder
#   0  19 * * 1-6  ->  /hrms/attendance/cron/auto-checkout
@router.api_route("/cron/checkin-reminder", methods=["GET", "POST"])
def cron_checkin_reminder(request: Request):
    _cron_guard(request)
    return dispatch_daily_checkin_reminders()


@router.api_route("/cron/checkout-reminder", methods=["GET", "POST"])
def cron_checkout_reminder(request: Request):
    _cron_guard(request)
    return dispatch_daily_checkout_reminders()


@router.api_route("/cron/auto-checkout", methods=["GET", "POST"])
def cron_auto_checkout(request: Request):
    _cron_guard(request)
    return auto_checkout_open_records()