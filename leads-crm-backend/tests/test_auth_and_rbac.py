import unittest
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient
from main import app
from auth.dependencies import get_current_user
from auth.permissions import require_crm_access

client = TestClient(app, raise_server_exceptions=False)


class TestAuthAndRBAC(unittest.TestCase):

    def test_auth_rejection_missing_header(self):
        """Unauthenticated requests without Authorization header must be rejected with 401."""
        res = client.get("/leads")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing or invalid Authorization header", res.json().get("detail", ""))

    def test_auth_rejection_invalid_token(self):
        """Requests with malformed/invalid bearer tokens must return 401."""
        with patch("auth.dependencies.supabase_anon") as mock_anon:
            mock_anon.auth.get_user.side_effect = Exception("Invalid token")
            res = client.get("/leads", headers={"Authorization": "Bearer bad-token-123"})
            self.assertEqual(res.status_code, 401)

    def test_auth_rejection_non_team_domain(self):
        """Tokens belonging to external domains (not @workfloww.ai) must be rejected with 403."""
        with patch("auth.dependencies.supabase_anon") as mock_anon:
            mock_user = MagicMock()
            mock_user.email = "attacker@gmail.com"
            mock_response = MagicMock()
            mock_response.user = mock_user
            mock_anon.auth.get_user.return_value = mock_response

            res = client.get("/leads", headers={"Authorization": "Bearer external-token"})
            self.assertEqual(res.status_code, 403)
            self.assertIn("not a part of our team", res.json().get("detail", ""))

    def test_rbac_non_crm_user_blocked_from_leads(self):
        """Employees without CRM access (e.g. Tech team, can_access_crm=False) must receive 403 on /leads."""
        class AuthUser:
            def __init__(self):
                self.id = "user-tech-1"
                self.email = "developer@workfloww.ai"
                self.token = "valid-tech-token"

        def mock_get_current_user():
            return AuthUser()

        mock_db_client = MagicMock()
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_single = MagicMock()
        mock_execute = MagicMock()

        mock_execute.data = {
            "role_level": 0,
            "department": "Tech",
            "secondary_department": None,
            "can_access_crm": False,
        }
        mock_single.execute.return_value = mock_execute
        mock_eq.single.return_value = mock_single
        mock_select.eq.return_value = mock_eq
        mock_table.select.return_value = mock_select
        mock_db_client.table.return_value = mock_table

        with patch("auth.permissions.get_client_for_user", return_value=mock_db_client):
            app.dependency_overrides[get_current_user] = mock_get_current_user
            try:
                res = client.get("/leads", headers={"Authorization": "Bearer valid-tech-token"})
                self.assertEqual(res.status_code, 403)
                self.assertIn("Only Growth and Leadership team members have access", res.json().get("detail", ""))
            finally:
                app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
