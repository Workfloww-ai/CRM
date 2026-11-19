import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from starlette.testclient import TestClient
from main import app
from services.whatsapp import normalize_phone

IST = timezone(timedelta(hours=5, minutes=30))
client = TestClient(app, raise_server_exceptions=False)


class TestAttendanceFlow(unittest.TestCase):

    def setUp(self):
        self.mock_user = {
            "id": "emp-uuid-1",
            "full_name": "Test Employee",
            "phone": "918527880288",
            "email": "test@workfloww.ai"
        }

    @patch("routers.attendance.get_admin_client")
    @patch("routers.attendance.send_whatsapp_message")
    def test_morning_hi_does_not_trigger_checkout(self, mock_wa_msg, mock_admin_client):
        """When an employee sends 'hi' or chat right after checking in in the morning, do not trigger checkout."""
        mock_db = MagicMock()
        mock_admin_client.return_value = mock_db
        mock_db.rpc.return_value.execute.return_value.data = [self.mock_user]

        # Checked in 5 minutes ago
        recent_checkin = (datetime.now(IST) - timedelta(minutes=5)).isoformat()
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{
            "id": "rec-1",
            "user_id": "emp-uuid-1",
            "date": datetime.now(IST).strftime("%Y-%m-%d"),
            "check_in_at": recent_checkin,
            "check_out_at": None,
            "notes": None
        }]

        payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "918527880288",
                            "text": {"body": "hi"},
                            "type": "text"
                        }]
                    }
                }]
            }]
        }

        res = client.post("/api/whatsapp-webhook", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "info_checked_in")
        self.assertTrue(mock_wa_msg.called)
        self.assertIn("checked in today", mock_wa_msg.call_args[0][1])

    @patch("routers.attendance.get_admin_client")
    def test_emoji_reaction_is_ignored(self, mock_admin_client):
        """WhatsApp reactions (like clicking 👍) or pure emoji text should be ignored without triggering checkout."""
        mock_db = MagicMock()
        mock_admin_client.return_value = mock_db
        mock_db.rpc.return_value.execute.return_value.data = [self.mock_user]

        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{
            "id": "rec-1",
            "user_id": "emp-uuid-1",
            "date": datetime.now(IST).strftime("%Y-%m-%d"),
            "check_in_at": "2026-11-19T09:30:00+05:30",
            "check_out_at": None,
        }]

        # 1. Native WhatsApp reaction event
        reaction_payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "918527880288",
                            "type": "reaction",
                            "reaction": {"message_id": "wamid-123", "emoji": "👍"}
                        }]
                    }
                }]
            }]
        }
        res1 = client.post("/api/whatsapp-webhook", json=reaction_payload)
        self.assertEqual(res1.status_code, 200)

        # 2. Text message with only an emoji
        emoji_payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "918527880288",
                            "text": {"body": "👍"},
                            "type": "text"
                        }]
                    }
                }]
            }]
        }
        res2 = client.post("/api/whatsapp-webhook", json=emoji_payload)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json().get("status"), "ack_ignored")

    @patch("routers.attendance.get_admin_client")
    @patch("routers.attendance.send_whatsapp_message")
    @patch("routers.attendance.send_location_request_message")
    def test_checked_in_user_typing_checkout_triggers_checkout(self, mock_loc_msg, mock_wa_msg, mock_admin_client):
        """When an employee has already checked in today, typing 'Check out' triggers the checkout flow."""
        mock_db = MagicMock()
        mock_admin_client.return_value = mock_db
        mock_db.rpc.return_value.execute.return_value.data = [self.mock_user]

        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{
            "id": "rec-1",
            "user_id": "emp-uuid-1",
            "date": datetime.now(IST).strftime("%Y-%m-%d"),
            "check_in_at": "2026-11-17T10:00:00+05:30",
            "check_out_at": None,
            "notes": None
        }]

        payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "918527880288",
                            "text": {"body": "Check out"},
                            "type": "text"
                        }]
                    }
                }]
            }]
        }

        res = client.post("/api/whatsapp-webhook", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "checkout_location_requested")

    @patch("routers.attendance.get_admin_client")
    @patch("routers.attendance.send_whatsapp_message")
    def test_unchecked_in_user_typing_checkout_is_blocked(self, mock_wa_msg, mock_admin_client):
        """When an employee has NOT checked in yet today, typing 'checkout' reminds them to check in first."""
        mock_db = MagicMock()
        mock_admin_client.return_value = mock_db
        mock_db.rpc.return_value.execute.return_value.data = [self.mock_user]

        # No record exists for today
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

        payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "918527880288",
                            "text": {"body": "checkout"},
                            "type": "text"
                        }]
                    }
                }]
            }]
        }

        res = client.post("/api/whatsapp-webhook", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "not_checked_in")
        sent_text = mock_wa_msg.call_args[0][1]
        self.assertIn("haven't checked in", sent_text)


if __name__ == "__main__":
    unittest.main()

