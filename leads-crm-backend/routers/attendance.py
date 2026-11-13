import io
import csv
import logging
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
    send_checkin_reminder_template,
    normalize_phone,
    extract_whatsapp_message,
    WHATSAPP_VERIFY_TOKEN,
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
        # e.g. "2026-10"
        query = query.gte("date", f"{month}-01").lte("date", f"{month}-31")

    res = query.execute()
    return res.data or []


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
    employees = client.table("profiles") \
        .select("id, full_name, email, emp_code, department, phone, avatar_color, is_active") \
        .eq("is_active", True) \
        .order("full_name") \
        .execute().data or []

    # 2. Fetch all attendance records for date
    records = client.table("attendance_records") \
        .select("*, attendance_sites(name)") \
        .eq("date", date_str) \
        .execute().data or []
    rec_by_user = {r["user_id"]: r for r in records}

    # 3. Fetch leaves on date
    leaves = client.table("leave_requests") \
        .select("*, profiles(full_name)") \
        .eq("status", "approved") \
        .lte("start_date", date_str) \
        .gte("end_date", date_str) \
        .execute().data or []
    leave_by_user = {l["user_id"]: l for l in leaves}

    # 4. Check if holiday
    holiday = client.table("company_holidays").select("*").eq("holiday_date", date_str).execute().data

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
    month: str = Query(..., description="Format: YYYY-MM e.g. 2026-10"),
    user=Depends(require_hrms_manager_or_admin),
):
    client = get_client_for_user(user.token)

    start_date = f"{month}-01"
    end_date = f"{month}-31"

    # All active profiles
    profiles = client.table("profiles").select("id, full_name, email, department, emp_code").eq("is_active", True).execute().data or []

    # All attendance in range
    records = client.table("attendance_records") \
        .select("*") \
        .gte("date", start_date) \
        .lte("date", end_date) \
        .execute().data or []

    # All leaves in range
    leaves = client.table("leave_requests") \
        .select("*") \
        .eq("status", "approved") \
        .gte("end_date", start_date) \
        .lte("start_date", end_date) \
        .execute().data or []

    # Holidays in month
    holidays = client.table("company_holidays") \
        .select("*") \
        .gte("holiday_date", start_date) \
        .lte("holiday_date", end_date) \
        .execute().data or []

    # Aggregate by employee
    report_rows = []
    for p in profiles:
        uid = p["id"]
        emp_records = [r for r in records if r["user_id"] == uid]
        present_days = len(emp_records)
        late_days = sum(1 for r in emp_records if r.get("is_late"))
        total_work_hours = sum(float(r.get("work_hours") or 0) for r in emp_records)
        avg_hours = round(total_work_hours / present_days, 2) if present_days > 0 else 0.0

        emp_leaves = [l for l in leaves if l["user_id"] == uid]
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
    start_date = f"{month}-01"
    end_date = f"{month}-31"

    records = client.table("attendance_records") \
        .select("date, check_in_at, check_out_at, work_hours, is_late, check_in_within_geofence, check_in_source, profiles(full_name, email, emp_code, department)") \
        .gte("date", start_date) \
        .lte("date", end_date) \
        .order("date", desc=True) \
        .execute().data or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Employee Name", "Email", "Emp Code", "Department",
        "Check-In Time", "Check-Out Time", "Work Hours", "Is Late", "Within Geo-Fence", "Source"
    ])

    for r in records:
        prof = r.get("profiles") or {}
        writer.writerow([
            r.get("date"),
            prof.get("full_name", ""),
            prof.get("email", ""),
            prof.get("emp_code", ""),
            prof.get("department", ""),
            r.get("check_in_at") or "-",
            r.get("check_out_at") or "-",
            r.get("work_hours") or "-",
            "Yes" if r.get("is_late") else "No",
            "Yes" if r.get("check_in_within_geofence") else "No",
            r.get("check_in_source") or "web",
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

    # 1. Verify Signature (if present)
    if signature and not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid signature received on WhatsApp webhook.")
        print("[WHATSAPP WEBHOOK] Signature verification failed!", flush=True)
        return Response(content="Invalid signature", status_code=403)

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
    try:
        all_profiles = admin_client.table("profiles").select("id, full_name, email, phone, emergency_contact_phone").execute().data or []
    except Exception as db_err:
        print(f"[WHATSAPP WEBHOOK ERROR] Failed to fetch profiles from Supabase: {db_err}", flush=True)
        all_profiles = []

    print(f"[WHATSAPP WEBHOOK] Found {len(all_profiles)} employee profiles in Supabase.", flush=True)
    logger.info(f"Looking up phone '{normalized_sender_phone}' across {len(all_profiles)} employee profiles in DB.")

    matched_user = None
    for prof in all_profiles:
        prof_phone = normalize_phone(prof.get("phone", ""))
        emg_phone = normalize_phone(prof.get("emergency_contact_phone", ""))
        if (prof_phone and prof_phone == normalized_sender_phone) or (emg_phone and emg_phone == normalized_sender_phone):
            matched_user = prof
            break

    # Secondary direct lookup if full scan didn't match
    if not matched_user:
        try:
            direct = admin_client.table("profiles").select("id, full_name, email, phone").ilike("phone", f"%{normalized_sender_phone}%").execute().data or []
            if direct:
                matched_user = direct[0]
        except Exception:
            pass

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

    # 4. Handle "OUT" or "CHECKOUT" (only when coordinates are not sent)
    is_checkout = (
        text_content in ("OUT", "CHECK OUT", "CHECKOUT", "LEAVE", "EXIT", "CHECK-OUT")
        or "CHECK OUT" in text_content
        or "CHECKOUT" in text_content
        or "CHECK-OUT" in text_content
    )
    if is_checkout and (lat is None or lng is None):
        existing = admin_client.table("attendance_records") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("date", today_str) \
            .execute().data

        if not existing or not existing[0].get("check_in_at"):
            send_whatsapp_message(
                from_phone,
                f"Hello {emp_name}, you haven't checked in yet today! Tap 'Check In' or share your GPS location first."
            )
            return {"status": "not_checked_in"}

        rec = existing[0]
        if rec.get("check_out_at"):
            send_whatsapp_message(
                from_phone,
                f"Hello {emp_name}, you have already checked out today at {rec.get('check_out_at')}."
            )
            return {"status": "already_checked_out"}

        # Calculate work hours
        work_hours = None
        in_time_str = rec.get("check_in_at")
        if in_time_str:
            try:
                in_dt = datetime.fromisoformat(in_time_str.replace("Z", "+00:00"))
                diff_sec = (ist_now.astimezone(timezone.utc) - in_dt.astimezone(timezone.utc)).total_seconds()
                work_hours = round(max(0.0, diff_sec / 3600.0), 2)
            except Exception:
                pass

        admin_client.table("attendance_records").update({
            "check_out_at": ist_now.isoformat(),
            "status": "checked_out",
            "work_hours": work_hours,
        }).eq("id", rec["id"]).execute()

        hours_msg = f" Total work duration: {work_hours} hrs." if work_hours else ""
        send_whatsapp_message(
            from_phone,
            f"👋 Goodbye {emp_name}! You have successfully checked out at {time_str}.{hours_msg}\nHave a wonderful evening!"
        )
        return {"status": "checked_out"}

    # 5. Handle Location Attachment (GPS Pin Shared)
    if lat is not None and lng is not None:
        site = ensure_default_site(admin_client)
        site_id = site.get("id")
        site_name = site.get("name", "Alt.F Coworking")
        within_geofence = check_geofence_with_postgis(admin_client, float(lat), float(lng), site_id) if site_id else False

        shift = get_default_shift(admin_client)
        late_flag = is_checkin_late(shift, ist_now)

        # Check existing today record
        existing = admin_client.table("attendance_records") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("date", today_str) \
            .execute().data

        # If already checked in and already inside geofence, inform them
        if existing and existing[0].get("check_in_at") and existing[0].get("check_in_within_geofence"):
            send_whatsapp_message(
                from_phone,
                f"ℹ️ Hi {emp_name}, your attendance was already recorded for today.\n"
                f"Site: {site_name} (Verified Inside Geo-fence)\n\n"
                f"Reply 'OUT' when leaving to end your shift."
            )
            return {"status": "already_checked_in"}

        rec_payload = {
            "user_id": user_id,
            "site_id": site_id,
            "shift_id": shift.get("id") if shift else None,
            "check_in_at": ist_now.isoformat(),
            "check_in_latitude": float(lat),
            "check_in_longitude": float(lng),
            "check_in_within_geofence": within_geofence,
            "check_in_source": "whatsapp",
            "date": today_str,
            "status": "checked_in",
            "is_late": late_flag,
        }

        if existing:
            admin_client.table("attendance_records").update(rec_payload).eq("id", existing[0]["id"]).execute()
        else:
            admin_client.table("attendance_records").insert(rec_payload).execute()

        fence_msg = f"✅ Inside {site_name} geo-fence." if within_geofence else f"⚠️ Outside office radius for {site_name}."
        late_msg = " (Marked Late)" if late_flag else ""

        reply = (
            f"✅ Good morning {emp_name}!\n"
            f"Attendance marked at {time_str}{late_msg}.\n"
            f"Site: {site_name}\n"
            f"Status: {fence_msg}\n\n"
            f"Reply 'OUT' when leaving to end your shift."
        )
        send_whatsapp_message(from_phone, reply)
        return {"status": "check_in_recorded", "within_geofence": within_geofence}

    # 6. Handle "Check In" button tap or text check-in prompt -> Record Attendance Immediately in Supabase!
    is_checkin_prompt = (
        text_content in ("IN", "CHECKIN", "CHECK IN", "CHECK-IN", "PRESENT", "HI", "HELLO", "START", "LOGIN")
        or "CHECK IN" in text_content
        or "CHECKIN" in text_content
        or "CHECK-IN" in text_content
    )
    if is_checkin_prompt:
        site = ensure_default_site(admin_client)
        site_id = site.get("id") if site else None
        site_name = site.get("name", "Office") if site else "Office"

        shift = get_default_shift(admin_client)
        late_flag = is_checkin_late(shift, ist_now)

        # Check if already checked in today
        existing = admin_client.table("attendance_records") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("date", today_str) \
            .execute().data

        if existing and existing[0].get("check_in_at"):
            prev_in_time = existing[0].get("check_in_at")
            try:
                prev_dt = datetime.fromisoformat(prev_in_time.replace("Z", "+00:00")).astimezone(IST)
                prev_time_str = prev_dt.strftime("%I:%M %p")
            except Exception:
                prev_time_str = prev_in_time

            send_whatsapp_message(
                from_phone,
                f"ℹ️ Hi {emp_name}, your attendance was already recorded today at {prev_time_str}.\n"
                f"Status: Checked In ✅\n\n"
                f"Reply 'OUT' when leaving to record your check-out."
            )
            return {"status": "already_checked_in", "user_id": user_id, "check_in_at": prev_in_time}

        # Store check-in record in Supabase
        rec_payload = {
            "user_id": user_id,
            "site_id": site_id,
            "shift_id": shift.get("id") if shift else None,
            "check_in_at": ist_now.isoformat(),
            "check_in_source": "whatsapp",
            "date": today_str,
            "status": "checked_in",
            "is_late": late_flag,
        }

        try:
            if existing:
                ins_res = admin_client.table("attendance_records").update(rec_payload).eq("id", existing[0]["id"]).execute()
            else:
                ins_res = admin_client.table("attendance_records").insert(rec_payload).execute()
            saved_record = ins_res.data[0] if (ins_res and ins_res.data) else rec_payload
            print(f"[WHATSAPP WEBHOOK] Successfully saved attendance record to Supabase: {saved_record}", flush=True)
            logger.info(f"Attendance recorded via WhatsApp for user {user_id} ({emp_name}) at {ist_now.isoformat()}")
        except Exception as ins_err:
            print(f"[WHATSAPP WEBHOOK ERROR] FAILED to save to attendance_records table: {ins_err}", flush=True)
            logger.error(f"FAILED to save to attendance_records table: {ins_err}", exc_info=True)
            saved_record = rec_payload

        late_msg = " (Marked Late)" if late_flag else ""
        confirmation_msg = (
            f"✅ Hi {emp_name}!\n"
            f"Your attendance has been marked successfully at {time_str}{late_msg}.\n"
            f"Date: {today_str}\n\n"
            f"Have a productive day at work! 🌟\n"
            f"Reply 'OUT' when leaving to end your shift."
        )
        send_whatsapp_message(from_phone, confirmation_msg)
        return {
            "status": "check_in_recorded",
            "user_id": user_id,
            "check_in_at": ist_now.isoformat(),
            "record": saved_record,
        }

    # 7. Default help message
    send_whatsapp_message(
        from_phone,
        f"Flowwies Attendance Bot 🤖\n\n"
        f"Available commands:\n"
        f"• Tap *'Check In'* or share your *Location* to check in\n"
        f"• Reply *'OUT'* to check out\n"
        f"• Alt.F Coworking Geo-fencing is active"
    )
    return {"status": "help_sent"}


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

