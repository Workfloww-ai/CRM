"""
services/whatsapp.py  (rewritten)

Outbound  : text, native "Send location" request, reply-button, template messages
            via mobiCOMM (dovesoft) first, Meta Cloud API as fallback.
Inbound   : signature check + payload extraction (Meta and mobiCOMM flat formats).

Important WhatsApp rule: anything we send PROACTIVELY (9:30 check-in / 17:30 check-out reminders)
must be an approved TEMPLATE. Free-form / interactive messages only deliver inside the 24h window
after the employee last messaged us, so they are used only as replies or as fallbacks.
"""
import os
import re
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

import requests

logger = logging.getLogger("whatsapp_service")

IST = timezone(timedelta(hours=5, minutes=30))

WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "workfloww_attendance_webhook_token")
WHATSAPP_APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v21.0")
WABA_NUMBER = (
    os.environ.get("WABA_NUMBER")
    or os.environ.get("MOBICOMM_WABA_NUMBER")
    or os.environ.get("WHATSAPP_PHONE_NUMBER")
    or ""
).strip().strip('"').strip("'")

DEFAULT_MOBICOMM_URL = "https://api.dovesoft.io/REST/directApi/message"
OK_CODES = (200, 201, 202)


# =========================================================================
# Small helpers
# =========================================================================

def _env(*names: str, default: str = "") -> str:
    for n in names:
        v = (os.environ.get(n) or "").strip().strip('"').strip("'")
        if v:
            return v
    return default


def clean_phone(phone: str) -> str:
    """Digits only, with India country code added to bare 10-digit numbers."""
    digits = re.sub(r"[^\d]", "", str(phone or ""))
    return "91" + digits if len(digits) == 10 else digits


def normalize_phone(phone: str) -> str:
    """Digits only, last 10 digits, used for matching profiles."""
    digits = re.sub(r"[^\d]", "", str(phone or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def _mobicomm_token() -> str:
    return _env("MOBICOMM_AUTH_TOKEN", "MOBICOMM_API_KEY", "MOBICOMM_TOKEN")


def _mobicomm_url() -> str:
    return _env("MOBICOMM_API_URL", "MOBICOMM_DIRECT_API_URL", default=DEFAULT_MOBICOMM_URL)


def _mobicomm_enabled() -> bool:
    return bool(_env("MOBICOMM_API_URL", "MOBICOMM_DIRECT_API_URL") or _mobicomm_token())


def _waba() -> str:
    w = clean_phone(_env("WABA_NUMBER", "MOBICOMM_WABA_NUMBER", "WHATSAPP_PHONE_NUMBER") or WABA_NUMBER)
    return w


def _mobicomm_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = _mobicomm_token()
    if token:
        bearer = token if token.lower().startswith("bearer ") else f"Bearer {token}"
        raw = token[7:] if token.lower().startswith("bearer ") else token
        headers.update({"Authorization": bearer, "x-api-key": raw, "key": raw, "apiKey": raw})
    waba = _waba()
    if waba:
        headers.update({"wabaNumber": waba, "wabanumber": waba, "waba_number": waba})
    else:
        logger.warning("WABA_NUMBER is not set in environment.")
    return headers


def _post(url: str, payload: dict, headers: dict, label: str) -> bool:
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code in OK_CODES:
            return True
        logger.warning(f"{label} returned {resp.status_code}: {resp.text[:500]}")
    except Exception as e:
        logger.error(f"{label} error: {e}")
    return False


def _post_mobicomm(payload: dict, label: str) -> bool:
    if not _mobicomm_enabled():
        return False
    return _post(_mobicomm_url(), payload, _mobicomm_headers(), f"mobiCOMM {label}")


def _post_meta(payload: dict, label: str) -> bool:
    token = _env("WHATSAPP_TOKEN") or WHATSAPP_TOKEN
    phone_id = _env("WHATSAPP_PHONE_NUMBER_ID") or WHATSAPP_PHONE_NUMBER_ID
    if not token or not phone_id:
        return False
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages"
    return _post(url, payload, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, f"Meta {label}")


def _deliver(mobi_payload: dict, meta_payload: dict, label: str) -> bool:
    """mobiCOMM first, then Meta Cloud API. True as soon as either accepts the message."""
    if _post_mobicomm(mobi_payload, label):
        return True
    if _post_meta(meta_payload, label):
        return True
    return False


# =========================================================================
# Webhook signature
# =========================================================================

def verify_meta_signature(raw_payload: bytes, signature_header: Optional[str]) -> bool:
    """
    - Signature header present + app secret configured -> strict HMAC-SHA256 check.
    - Header absent (mobiCOMM relay) -> returns True here; the router additionally enforces
      WHATSAPP_RELAY_TOKEN when that env var is set.
    """
    app_secret = (os.environ.get("WHATSAPP_APP_SECRET") or WHATSAPP_APP_SECRET or "").strip()
    if not signature_header:
        return True
    if not app_secret:
        logger.warning("WHATSAPP_APP_SECRET not configured; accepting webhook with unverified signature header.")
        return True

    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature_header.strip()):
        logger.warning("WhatsApp webhook signature mismatch.")
        return False
    return True


# =========================================================================
# Outbound messages
# =========================================================================

def send_whatsapp_message(to_phone: str, message_text: str) -> bool:
    """Plain text message (only delivers inside the 24h customer-service window)."""
    to = clean_phone(to_phone)
    mobi = {"to": to, "type": "text", "text": {"body": message_text}, "message": message_text}
    waba = _waba()
    if waba:
        mobi.update({"wabaNumber": waba, "from": waba})
    meta = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": message_text}}
    ok = _deliver(mobi, meta, "text")
    if not ok:
        logger.error(f"Text message to {to} failed on all providers")
    return ok


def _interactive_payload(to: str, interactive: dict) -> dict:
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "interactive",
        "interactive": interactive,
    }


def send_location_request_message(to_phone: str, body_text: Optional[str] = None) -> bool:
    """
    Native 'Send location' button. If both providers reject it, sends ONE plain-text
    fallback with manual instructions (so the employee never gets two prompts when the button works).
    """
    to = clean_phone(to_phone)
    text = body_text or "Please tap the button below to share your current location."
    payload = _interactive_payload(to, {
        "type": "location_request_message",
        "body": {"text": text},
        "action": {"name": "send_location"},
    })
    if _deliver(payload, payload, "location request"):
        return True

    fallback = (
        f"{text}\n\n"
        f"📍 How to share:\n"
        f"1️⃣ Tap the 📎 (or ➕) icon in WhatsApp\n"
        f"2️⃣ Select *Location*\n"
        f"3️⃣ Tap *'Send Your Current Location'*"
    )
    return send_whatsapp_message(to_phone, fallback)


def send_button_message(to_phone: str, body_text: str, button_id: str, button_title: str) -> bool:
    """Single reply-button interactive message (needs an open 24h window)."""
    payload = _interactive_payload(clean_phone(to_phone), {
        "type": "button",
        "body": {"text": body_text},
        "action": {"buttons": [{"type": "reply", "reply": {"id": button_id, "title": button_title}}]},
    })
    return _deliver(payload, payload, f"button {button_id}")


def _send_template(
    to_phone: str,
    template_name: str,
    params: list,
    mobi_params: Optional[list] = None,
) -> Tuple[bool, str]:
    """Generic BODY-variables template sender (mobiCOMM first, Meta fallback)."""
    to = clean_phone(to_phone)

    def comps(values):
        return [{"type": "BODY", "parameters": [{"text": str(v), "type": "text"} for v in values]}]

    mobi = {
        "template": {
            "components": comps(mobi_params if mobi_params is not None else params),
            "name": template_name,
            "language": {"code": "en", "policy": "deterministic"},
        },
        "to": to,
        "type": "template",
        "templateName": template_name,
    }
    waba = _waba()
    if waba:
        mobi.update({"wabaNumber": waba, "from": waba})

    meta = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": str(v).strip()} for v in params]}],
        },
    }

    if _post_mobicomm(mobi, f"template {template_name}"):
        return True, f"{template_name} sent via mobiCOMM"
    if _post_meta(meta, f"template {template_name}"):
        return True, f"{template_name} sent via Meta Cloud API"
    return False, f"{template_name}: no provider accepted the message (check credentials / template approval)"


def send_checkin_reminder_template(
    to_phone: str, employee_name: str, date_today: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Approved template `employee_checkin_reminder` (Quick-Reply button: "Check-In").
      {{1}} = name, {{2}} = date
    """
    date_today = (date_today or datetime.now(IST).strftime("%d %b %Y")).strip()
    return _send_template(
        to_phone, "employee_checkin_reminder",
        [employee_name, date_today],
        mobi_params=[employee_name, " " + date_today],   # leading space as configured in mobiCOMM
    )


def send_checkout_reminder_template(
    to_phone: str, employee_name: str, date_today: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Approved template `employee_checkout_reminder` (category UTILITY, Quick-Reply button: "Check-Out").
    Suggested body:  Hi {{1}}! It's time to wrap up for {{2}}. Tap Check-Out below to record your hours.
    """
    date_today = (date_today or datetime.now(IST).strftime("%d %b %Y")).strip()
    return _send_template(to_phone, "employee_checkout_reminder", [employee_name, date_today])


def send_checkin_prompt_message(to_phone: str, employee_name: str) -> bool:
    """
    Check-in prompt. Used when someone says "hi" etc. (24h window is open) and as fallback
    for the morning reminder. Order: button message -> template -> plain text.
    """
    body = f"👋 Good morning {employee_name}!\n\nPlease mark your attendance for today. Tap the *Check-In* button below."
    if send_button_message(to_phone, body, "btn_checkin", "Check-In"):
        return True
    ok, _ = send_checkin_reminder_template(to_phone, employee_name)
    if ok:
        return True
    return send_whatsapp_message(
        to_phone,
        f"👋 Good morning {employee_name}!\n\nPlease mark your attendance for today.\n"
        f"Reply *IN* or share your location to check in! 🚀",
    )


def send_checkout_reminder_message(to_phone: str, employee_name: str) -> bool:
    """Check-out prompt (button -> plain text). The scheduled 5:30 PM send tries the template first."""
    body = (
        f"👋 Hi {employee_name}!\n\n"
        f"Time to wrap up. Tap *Check-Out* below to share your location and record your work hours."
    )
    if send_button_message(to_phone, body, "btn_checkout", "Check-Out"):
        return True
    return send_whatsapp_message(
        to_phone,
        f"👋 Hi {employee_name}!\n\nTime to wrap up. Reply *OUT* to record your work hours for today! 🌟",
    )


# =========================================================================
# Inbound payload extraction
# =========================================================================

def extract_whatsapp_message(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Returns {from_phone, type, text, latitude, longitude, location_name, message_id} or None
    (statuses / unknown payloads). Supports Meta Cloud API and mobiCOMM flat / nested payloads.
    """
    try:
        if not isinstance(payload, dict):
            return None

        # ---- 1. Meta Cloud API format ----
        entries = payload.get("entry", [])
        if entries and isinstance(entries, list):
            changes = (entries[0] or {}).get("changes", [])
            if changes and isinstance(changes, list):
                val = changes[0].get("value", {}) or {}
                messages = val.get("messages", [])
                if messages and isinstance(messages, list):
                    msg = messages[0] or {}
                    msg_type = msg.get("type") or "text"
                    extracted = {
                        "from_phone": str(msg.get("from") or ""),
                        "type": msg_type,
                        "text": None,
                        "latitude": None,
                        "longitude": None,
                        "location_name": None,
                        "message_id": msg.get("id"),
                    }

                    if msg_type == "text":
                        extracted["text"] = (msg.get("text", {}) or {}).get("body", "").strip()
                    elif msg_type == "location":
                        loc = msg.get("location", {}) or {}
                        extracted["latitude"] = loc.get("latitude")
                        extracted["longitude"] = loc.get("longitude")
                        extracted["location_name"] = loc.get("name") or loc.get("address")
                        extracted["text"] = "LOCATION"
                    elif msg_type == "interactive":
                        inter = msg.get("interactive", {}) or {}
                        br = inter.get("button_reply", {}) or {}
                        lr = inter.get("list_reply", {}) or {}
                        extracted["text"] = (
                            br.get("id") or br.get("title") or lr.get("id") or lr.get("title") or ""
                        ).strip()
                    elif msg_type == "button":
                        btn = msg.get("button", {}) or {}
                        extracted["text"] = (btn.get("text") or btn.get("payload") or "").strip()

                    if msg.get("location") and extracted["latitude"] is None:
                        loc = msg.get("location") or {}
                        extracted["latitude"] = loc.get("latitude")
                        extracted["longitude"] = loc.get("longitude")
                        extracted["location_name"] = loc.get("name") or loc.get("address")
                        extracted["type"] = "location"

                    return extracted

                if val.get("statuses"):   # sent / delivered / read receipts
                    return None

        # ---- 2. mobiCOMM / custom flat or nested format ----
        if isinstance(payload.get("data"), dict):
            return extract_whatsapp_message(payload["data"])
        if isinstance(payload.get("payload"), dict):
            return extract_whatsapp_message(payload["payload"])

        from_phone = (
            payload.get("from") or payload.get("mobile") or payload.get("phone") or payload.get("waId")
            or payload.get("sender") or payload.get("msisdn") or payload.get("from_phone")
            or payload.get("mobile_number") or payload.get("whatsapp_number")
            or payload.get("customer_number") or payload.get("number")
            or payload.get("userPhone") or payload.get("source")
        )

        if not from_phone and isinstance(payload.get("message"), dict):
            return extract_whatsapp_message(payload["message"])
        if not from_phone:
            return None

        msg_type = payload.get("type") or "text"
        text = None
        lat = lng = loc_name = None

        raw_text = payload.get("text") or payload.get("message") or payload.get("body")
        if isinstance(raw_text, dict):
            text = raw_text.get("body") or raw_text.get("text")
        elif isinstance(raw_text, str):
            text = raw_text

        btn = (
            payload.get("button") or payload.get("button_reply") or payload.get("buttonResponse")
            or payload.get("selectedButtonId") or payload.get("action") or payload.get("quick_reply")
        )
        if isinstance(btn, dict):
            text = btn.get("text") or btn.get("title") or btn.get("payload") or btn.get("id") or text
        elif isinstance(btn, str):
            text = btn

        if not text and isinstance(payload.get("payload"), str):
            text = payload.get("payload")

        inter = payload.get("interactive")
        if isinstance(inter, dict):
            br = inter.get("button_reply", {}) or {}
            text = br.get("title") or br.get("id") or text

        loc = payload.get("location")
        if isinstance(loc, dict):
            lat = loc.get("latitude") or loc.get("lat")
            lng = loc.get("longitude") or loc.get("lng") or loc.get("long")
            loc_name = loc.get("name") or loc.get("address")
        if lat is None:
            lat = payload.get("latitude") or payload.get("lat")
        if lng is None:
            lng = payload.get("longitude") or payload.get("lng") or payload.get("long")

        if lat is not None and lng is not None:
            try:
                lat, lng = float(lat), float(lng)
                msg_type = "location"
                text = text or "LOCATION"
            except (ValueError, TypeError):
                lat = lng = None

        return {
            "from_phone": str(from_phone),
            "type": msg_type,
            "text": (text or "").strip() if text else None,
            "latitude": lat,
            "longitude": lng,
            "location_name": loc_name,
            "message_id": (
                payload.get("id") or payload.get("messageId") or payload.get("message_id")
                or payload.get("wamid") or payload.get("msgId")
            ),
        }
    except Exception as e:
        logger.error(f"Failed to extract WhatsApp message: {e}")
        return None
