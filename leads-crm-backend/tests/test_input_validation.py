import unittest
from starlette.testclient import TestClient
from main import app
from auth.permissions import require_crm_access
from db.queries import sanitize_postgrest_value
from main import sanitize_csv_cell, sanitize_csv_row

client = TestClient(app, raise_server_exceptions=False)


def mock_crm_user():
    class AuthUser:
        def __init__(self):
            self.id = "user-growth-1"
            self.email = "growth@workfloww.ai"
            self.token = "valid-growth-token"
    return AuthUser()


class TestInputValidation(unittest.TestCase):

    def test_invalid_sort_field_returns_400(self):
        """Passing an unallowed sort field on /leads must trigger HTTP 400 Bad Request."""
        app.dependency_overrides[require_crm_access] = mock_crm_user
        try:
            res = client.get("/leads?sort_by=password_hash")
            self.assertEqual(res.status_code, 400)
            self.assertIn("Invalid sort field", res.json().get("detail", ""))

            res_injection = client.get("/leads?sort_by=first_name;DROP+TABLE+leads--")
            self.assertEqual(res_injection.status_code, 400)
            self.assertIn("Invalid sort field", res_injection.json().get("detail", ""))
        finally:
            app.dependency_overrides.clear()

    def test_invalid_sort_dir_returns_400(self):
        """Passing an invalid sort direction on /leads must trigger HTTP 400 Bad Request."""
        app.dependency_overrides[require_crm_access] = mock_crm_user
        try:
            res = client.get("/leads?sort_dir=sideways")
            self.assertEqual(res.status_code, 400)
            self.assertIn("Invalid sort direction", res.json().get("detail", ""))
        finally:
            app.dependency_overrides.clear()

    def test_postgrest_filter_sanitization(self):
        """Verify that PostgREST syntax delimiters are stripped from search inputs."""
        malicious_input = 'test",other_col.eq.value,"'
        cleaned = sanitize_postgrest_value(malicious_input)
        self.assertNotIn('"', cleaned)
        self.assertNotIn(',', cleaned)
        self.assertNotIn('(', cleaned)
        self.assertNotIn(')', cleaned)
        self.assertEqual(cleaned, "testother_col.eq.value")

        safe_search = "Acme Corp - Tech"
        self.assertEqual(sanitize_postgrest_value(safe_search), "Acme Corp - Tech")

    def test_csv_formula_injection_sanitization(self):
        """Verify that formula-triggering characters are neutralized with a leading single quote."""
        self.assertEqual(sanitize_csv_cell("=cmd|'/C calc'!A0"), "'=cmd|'/C calc'!A0")
        self.assertEqual(sanitize_csv_cell("@SUM(1,2)"), "'@SUM(1,2)")
        self.assertEqual(sanitize_csv_cell("+918527880288"), "'+918527880288")
        self.assertEqual(sanitize_csv_cell("-5+5"), "'-5+5")
        self.assertEqual(sanitize_csv_cell("\tTABBED"), "'\tTABBED")

        self.assertEqual(sanitize_csv_cell("Normal Text"), "Normal Text")
        self.assertEqual(sanitize_csv_cell("12345"), "12345")

        row = {"name": "=1+2", "org": "Workfloww"}
        sanitized = sanitize_csv_row(row)
        self.assertEqual(sanitized["name"], "'=1+2")
        self.assertEqual(sanitized["org"], "Workfloww")

    def test_whatsapp_signature_verification(self):
        """Verify WhatsApp webhook signature handling for mobiCOMM relays and Meta signatures."""
        import hmac
        import hashlib
        import os
        from services.whatsapp import verify_meta_signature

        payload = b'{"object":"whatsapp_business_account"}'

        # 1. mobiCOMM relay with no signature header -> must be accepted
        self.assertTrue(verify_meta_signature(payload, None))

        # 2. Meta signature with secret configured
        secret = "test_meta_app_secret"
        old_secret = os.environ.get("WHATSAPP_APP_SECRET")
        os.environ["WHATSAPP_APP_SECRET"] = secret
        try:
            valid_sig = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
            invalid_sig = "sha256=invalid_hex_string"

            # Valid signature -> accepted
            self.assertTrue(verify_meta_signature(payload, valid_sig))
            # Invalid signature -> rejected
            self.assertFalse(verify_meta_signature(payload, invalid_sig))
        finally:
            if old_secret is not None:
                os.environ["WHATSAPP_APP_SECRET"] = old_secret
            else:
                os.environ.pop("WHATSAPP_APP_SECRET", None)


if __name__ == "__main__":
    unittest.main()
