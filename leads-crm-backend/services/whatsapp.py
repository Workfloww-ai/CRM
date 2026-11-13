import os
import re
import hmac
import hashlib
import logging
from typing import Optional, Dict, Any, Tuple
import requests

logger = logging.getLogger("whatsapp_service")

WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "workfloww_attendance_webhook_token")
WHATSAPP_APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v21.0")
WABA_NUMBER = os.environ.get("WABA_NUMBER") or os.environ.get("MOBICOMM_WABA_NUMBER") or os.environ.get("WHATSAPP_PHONE_NUMBER", "")


def verify_meta_signature(raw_payload: bytes, signature_header: Optional[str]) -> bool:
    """
    Verifies that the incoming webhook is genuinely from Meta using SHA256 HMAC.
    If no signature header is provided (e.g., direct mobiCOMM webhook dispatch),
    or secret is not configured, passes verification.
    """
    if not WHATSAPP_APP_SECRET or not signature_header:
        return True

    expected = "sha256=" + hmac.new(
        WHATSAPP_APP_SECRET.encode("utf-8"),
        raw_payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)


def send_whatsapp_message(to_phone: str, message_text: str) -> bool:
    """
    Sends a WhatsApp text message via mobiCOMM API (if configured) or Meta Cloud API.
    """
    # Clean phone number (must be digits with country code, e.g. 91...)
    clean_phone = re.sub(r"[^\d]", "", to_phone)
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone

    # 1. Try mobiCOMM if configured
    mobicomm_url = os.environ.get("MOBICOMM_API_URL", "")
    mobicomm_token = os.environ.get("MOBICOMM_AUTH_TOKEN") or os.environ.get("MOBICOMM_API_KEY", "")

    if mobicomm_url:
        headers = {"Content-Type": "application/json"}
        if mobicomm_token:
            headers["Authorization"] = f"Bearer {mobicomm_token}"
            headers["x-api-key"] = mobicomm_token
            headers["key"] = mobicomm_token
            headers["apiKey"] = mobicomm_token
        payload = {
            "to": clean_phone,
            "type": "text",
            "text": {"body": message_text},
            "message": message_text,
        }
        if WABA_NUMBER:
            clean_waba = re.sub(r"[^\d]", "", WABA_NUMBER)
            if len(clean_waba) == 10:
                clean_waba = "91" + clean_waba
            payload["wabaNumber"] = clean_waba
            payload["from"] = clean_waba
        try:
            resp = requests.post(mobicomm_url, json=payload, headers=headers, timeout=10)
            if resp.status_code in (200, 201, 202):
                return True
            logger.warning(f"mobiCOMM text send returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Error calling mobiCOMM API: {e}")

    # 2. Fallback to Meta Cloud API
    token = os.environ.get("WHATSAPP_TOKEN", WHATSAPP_TOKEN)
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID)

    if not token or not phone_id:
        logger.warning("WhatsApp credentials (mobiCOMM / Meta) not configured in environment.")
        return False

    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {"body": message_text},
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 201):
            return True
        logger.error(f"WhatsApp send failed: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        logger.error(f"Error calling WhatsApp API: {e}")
        return False


def send_checkin_reminder_template(
    to_phone: str,
    employee_name: str,
    date_today: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Sends the WhatsApp template 'employee_checkin_reminder' to an employee.
    Variables:
      var 1 - name
      var 2 - date_today

    Payload Schema (as configured in mobiCOMM):
    {
      "template": {
        "components": [
          {
            "type": "BODY",
            "parameters": [
              { "text": employee_name, "type": "text" },
              { "text": " " + date_today, "type": "text" }
            ]
          }
        ],
        "name": "employee_checkin_reminder",
        "language": {
          "code": "en",
          "policy": "deterministic"
        }
      },
      "to": clean_phone,
      "type": "template",
      "templateName": "employee_checkin_reminder"
    }
    """
    clean_phone = re.sub(r"[^\d]", "", to_phone)
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone

    if not date_today:
        from datetime import datetime, timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))
        date_today = datetime.now(IST).strftime("%d %b %Y")

    formatted_date_var = date_today if str(date_today).startswith(" ") else f" {date_today}"

    # Standard mobiCOMM template payload structure
    mobicomm_payload = {
        "template": {
            "components": [
                {
                    "type": "BODY",
                    "parameters": [
                        {
                            "text": str(employee_name),
                            "type": "text"
                        },
                        {
                            "text": formatted_date_var,
                            "type": "text"
                        }
                    ]
                }
            ],
            "name": "employee_checkin_reminder",
            "language": {
                "code": "en",
                "policy": "deterministic"
            }
        },
        "to": clean_phone,
        "type": "template",
        "templateName": "employee_checkin_reminder"
    }

    # 1. Try mobiCOMM if configured
    mobicomm_url = os.environ.get("MOBICOMM_API_URL", "")
    mobicomm_token = os.environ.get("MOBICOMM_AUTH_TOKEN") or os.environ.get("MOBICOMM_API_KEY", "")

    if mobicomm_url:
        headers = {"Content-Type": "application/json"}
        if mobicomm_token:
            headers["Authorization"] = f"Bearer {mobicomm_token}"
            headers["x-api-key"] = mobicomm_token
            headers["key"] = mobicomm_token
            headers["apiKey"] = mobicomm_token
        if WABA_NUMBER:
            clean_waba = re.sub(r"[^\d]", "", WABA_NUMBER)
            if len(clean_waba) == 10:
                clean_waba = "91" + clean_waba
            mobicomm_payload["wabaNumber"] = clean_waba
            mobicomm_payload["from"] = clean_waba
        try:
            resp = requests.post(mobicomm_url, json=mobicomm_payload, headers=headers, timeout=10)
            if resp.status_code in (200, 201, 202):
                return True, "Reminder template sent via mobiCOMM"
            logger.warning(f"mobiCOMM template send returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Error calling mobiCOMM template API: {e}")

    # 2. Fallback to Meta Cloud API
    token = os.environ.get("WHATSAPP_TOKEN", WHATSAPP_TOKEN)
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID)

    if token and phone_id:
        url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        meta_payload = {
            "messaging_product": "whatsapp",
            "to": clean_phone,
            "type": "template",
            "template": {
                "name": "employee_checkin_reminder",
                "language": {"code": "en"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": str(employee_name)},
                            {"type": "text", "text": str(date_today).strip()},
                        ]
                    }
                ]
            }
        }
        try:
            resp = requests.post(url, json=meta_payload, headers=headers, timeout=10)
            if resp.status_code in (200, 201):
                return True, "Reminder template sent via Meta Cloud API"
            logger.error(f"Meta template send failed: {resp.status_code} {resp.text}")
            return False, f"Meta API error: {resp.status_code} {resp.text}"
        except Exception as e:
            return False, f"Meta API exception: {str(e)}"

    return False, "Neither mobiCOMM nor Meta Cloud API credentials are configured"


def normalize_phone(phone: str) -> str:
    """Normalizes phone to digits only, keeping last 10 digits for matching."""
    digits = re.sub(r"[^\d]", "", str(phone or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def extract_whatsapp_message(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extracts sender, text/button, and location coordinates from WhatsApp webhook payloads.
    Supports both Meta Cloud API structure and mobiCOMM flat/direct payload structure.
    """
    try:
        if not isinstance(payload, dict):
            return None

        # -------------------------------------------------------------
        # 1. Meta WhatsApp Cloud API / On-Premises Webhook Format
        # -------------------------------------------------------------
        entries = payload.get("entry", [])
        if entries and isinstance(entries, list):
            entry = entries[0] or {}
            changes = entry.get("changes", [])
            if changes and isinstance(changes, list):
                val = changes[0].get("value", {}) or {}
                messages = val.get("messages", [])
                if messages and isinstance(messages, list):
                    msg = messages[0] or {}
                    from_phone = str(msg.get("from") or "")
                    msg_type = msg.get("type") or "text"

                    extracted = {
                        "from_phone": from_phone,
                        "type": msg_type,
                        "text": None,
                        "latitude": None,
                        "longitude": None,
                        "location_name": None,
                    }

                    if msg_type == "text":
                        extracted["text"] = msg.get("text", {}).get("body", "").strip()
                    elif msg_type == "location":
                        loc = msg.get("location", {}) or {}
                        extracted["latitude"] = loc.get("latitude")
                        extracted["longitude"] = loc.get("longitude")
                        extracted["location_name"] = loc.get("name") or loc.get("address")
                        extracted["text"] = "LOCATION"
                    elif msg_type == "interactive":
                        inter = msg.get("interactive", {}) or {}
                        btn_reply = inter.get("button_reply", {}) or {}
                        list_reply = inter.get("list_reply", {}) or {}
                        extracted["text"] = (
                            btn_reply.get("title") or btn_reply.get("id") or
                            list_reply.get("title") or list_reply.get("id") or ""
                        ).strip()
                    elif msg_type == "button":
                        btn = msg.get("button", {}) or {}
                        extracted["text"] = (btn.get("text") or btn.get("payload") or "").strip()

                    # Check if location object exists inside msg regardless of explicit msg_type
                    if msg.get("location") and extracted["latitude"] is None:
                        loc = msg.get("location") or {}
                        extracted["latitude"] = loc.get("latitude")
                        extracted["longitude"] = loc.get("longitude")
                        extracted["location_name"] = loc.get("name") or loc.get("address")
                        extracted["type"] = "location"

                    return extracted

                # Delivery statuses (sent, delivered, read) - ignore quietly
                if val.get("statuses"):
                    return None

        # -------------------------------------------------------------
        # 2. mobiCOMM / Custom Flat or Semi-Flat Webhook Format
        # -------------------------------------------------------------
        # In case the payload is nested under "data", "payload", or "message"
        if isinstance(payload.get("data"), dict):
            return extract_whatsapp_message(payload["data"])
        if isinstance(payload.get("payload"), dict):
            return extract_whatsapp_message(payload["payload"])

        from_phone = (
            payload.get("from")
            or payload.get("mobile")
            or payload.get("phone")
            or payload.get("waId")
            or payload.get("sender")
            or payload.get("msisdn")
            or payload.get("from_phone")
            or payload.get("mobile_number")
            or payload.get("whatsapp_number")
            or payload.get("customer_number")
            or payload.get("number")
            or payload.get("userPhone")
            or payload.get("source")
        )

        if not from_phone and isinstance(payload.get("message"), dict):
            return extract_whatsapp_message(payload["message"])

        if not from_phone:
            return None

        msg_type = payload.get("type") or "text"
        extracted_text = None
        extracted_lat = None
        extracted_lng = None
        extracted_loc_name = None

        # Extract text / body / messages
        raw_text = payload.get("text") or payload.get("message") or payload.get("body")
        if isinstance(raw_text, dict):
            extracted_text = raw_text.get("body") or raw_text.get("text")
        elif isinstance(raw_text, str):
            extracted_text = raw_text

        # Button / interactive responses
        btn = (
            payload.get("button")
            or payload.get("button_reply")
            or payload.get("buttonResponse")
            or payload.get("selectedButtonId")
            or payload.get("action")
            or payload.get("quick_reply")
        )
        if isinstance(btn, dict):
            extracted_text = btn.get("text") or btn.get("title") or btn.get("payload") or btn.get("id") or extracted_text
        elif isinstance(btn, str):
            extracted_text = btn

        if not extracted_text and isinstance(payload.get("payload"), str):
            extracted_text = payload.get("payload")

        inter = payload.get("interactive")
        if isinstance(inter, dict):
            btn_reply = inter.get("button_reply", {}) or {}
            extracted_text = btn_reply.get("title") or btn_reply.get("id") or extracted_text

        # Extract location
        loc = payload.get("location")
        if isinstance(loc, dict):
            extracted_lat = loc.get("latitude") or loc.get("lat")
            extracted_lng = loc.get("longitude") or loc.get("lng") or loc.get("long")
            extracted_loc_name = loc.get("name") or loc.get("address")

        if extracted_lat is None:
            extracted_lat = payload.get("latitude") or payload.get("lat")
        if extracted_lng is None:
            extracted_lng = payload.get("longitude") or payload.get("lng") or payload.get("long")

        if extracted_lat is not None and extracted_lng is not None:
            try:
                extracted_lat = float(extracted_lat)
                extracted_lng = float(extracted_lng)
                msg_type = "location"
                if not extracted_text:
                    extracted_text = "LOCATION"
            except (ValueError, TypeError):
                pass

        return {
            "from_phone": str(from_phone),
            "type": msg_type,
            "text": (extracted_text or "").strip() if extracted_text else None,
            "latitude": extracted_lat,
            "longitude": extracted_lng,
            "location_name": extracted_loc_name,
        }
    except Exception as e:
        logger.error(f"Failed to extract WhatsApp message: {e}")
        return None
