import unittest
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient
from main import app
from auth.dependencies import get_current_user

client = TestClient(app, raise_server_exceptions=False)


def mock_employee_user():
    class AuthUser:
        def __init__(self):
            self.id = "emp-user-1"
            self.email = "emp1@workfloww.ai"
            self.token = "valid-emp-token"
    return AuthUser()


def mock_manager_user():
    class AuthUser:
        def __init__(self):
            self.id = "mgr-user-99"
            self.email = "manager@workfloww.ai"
            self.token = "valid-mgr-token"
    return AuthUser()


MOCK_TEAM_MEMBERS = [
    {
        "id": "emp-user-1",
        "full_name": "Alice Employee",
        "email": "emp1@workfloww.ai",
        "role_level": 0,
        "hrms_role": "employee",
        "department": "Tech",
        "bank_account_number": "1234567890",
        "ifsc_code": "PUNB0123456",
        "upi_id": "alice@upi",
        "address": "123 Main St",
        "phone": "9876543210",
        "personal_email": "alice.personal@gmail.com",
        "emergency_contact_phone": "9999999999",
        "dob": "1998-05-15",
    },
    {
        "id": "emp-user-2",
        "full_name": "Bob Colleague",
        "email": "emp2@workfloww.ai",
        "role_level": 0,
        "hrms_role": "employee",
        "department": "Growth",
        "bank_account_number": "9876543210",
        "ifsc_code": "HDFC0001234",
        "upi_id": "bob@upi",
        "address": "456 Side St",
        "phone": "8888888888",
        "personal_email": "bob.personal@gmail.com",
        "emergency_contact_phone": "7777777777",
        "dob": "1995-10-20",
    },
]


class TestPIIRedaction(unittest.TestCase):

    def test_pii_redaction_for_non_manager_caller(self):
        """When a regular employee views /hrms/team, sensitive PII of other employees must be redacted to None."""
        mock_db_client = MagicMock()

        mock_members_res = MagicMock()
        mock_members_res.data = [dict(m) for m in MOCK_TEAM_MEMBERS]

        mock_caller_res = MagicMock()
        mock_caller_res.data = {"role_level": 0, "hrms_role": "employee", "email": "emp1@workfloww.ai"}

        mock_pd_res = MagicMock()
        mock_pd_res.data = []

        def table_mock(table_name):
            t = MagicMock()
            if table_name == "profiles":
                t.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_caller_res
            elif table_name == "profile_departments":
                t.select.return_value.execute.return_value = mock_pd_res
            return t

        mock_db_client.table.side_effect = table_mock

        with patch("routers.hrms.get_client_for_user", return_value=mock_db_client), \
             patch("routers.hrms.get_all_team_members", return_value=mock_members_res):
            app.dependency_overrides[get_current_user] = mock_employee_user
            try:
                res = client.get("/hrms/team", headers={"Authorization": "Bearer valid-emp-token"})
                self.assertEqual(res.status_code, 200)
                team = res.json()
                self.assertEqual(len(team), 2)

                # Alice (the caller) can see her own details
                alice = next(m for m in team if m["id"] == "emp-user-1")
                self.assertEqual(alice["bank_account_number"], "1234567890")
                self.assertEqual(alice["phone"], "9876543210")

                # Bob's sensitive details MUST BE redacted to None
                bob = next(m for m in team if m["id"] == "emp-user-2")
                self.assertIsNone(bob["bank_account_number"])
                self.assertIsNone(bob["ifsc_code"])
                self.assertIsNone(bob["upi_id"])
                self.assertIsNone(bob["address"])
                self.assertIsNone(bob["phone"])
                self.assertIsNone(bob["personal_email"])
                self.assertIsNone(bob["emergency_contact_phone"])
                self.assertIsNone(bob["dob"])

                # But Bob's public directory fields remain visible
                self.assertEqual(bob["full_name"], "Bob Colleague")
                self.assertEqual(bob["email"], "emp2@workfloww.ai")
                self.assertIn("departments", bob)
            finally:
                app.dependency_overrides.clear()

    def test_no_redaction_for_manager_caller(self):
        """When a manager/admin views /hrms/team, sensitive details are NOT redacted."""
        mock_db_client = MagicMock()

        mock_members_res = MagicMock()
        mock_members_res.data = [dict(m) for m in MOCK_TEAM_MEMBERS]

        mock_caller_res = MagicMock()
        mock_caller_res.data = {"role_level": 1, "hrms_role": "manager", "email": "manager@workfloww.ai"}

        mock_pd_res = MagicMock()
        mock_pd_res.data = []

        def table_mock(table_name):
            t = MagicMock()
            if table_name == "profiles":
                t.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_caller_res
            elif table_name == "profile_departments":
                t.select.return_value.execute.return_value = mock_pd_res
            return t

        mock_db_client.table.side_effect = table_mock

        with patch("routers.hrms.get_client_for_user", return_value=mock_db_client), \
             patch("routers.hrms.get_all_team_members", return_value=mock_members_res):
            app.dependency_overrides[get_current_user] = mock_manager_user
            try:
                res = client.get("/hrms/team", headers={"Authorization": "Bearer valid-mgr-token"})
                self.assertEqual(res.status_code, 200)
                team = res.json()

                # Manager can see Bob's financial/personal details
                bob = next(m for m in team if m["id"] == "emp-user-2")
                self.assertEqual(bob["bank_account_number"], "9876543210")
                self.assertEqual(bob["phone"], "8888888888")
                self.assertEqual(bob["personal_email"], "bob.personal@gmail.com")
            finally:
                app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
