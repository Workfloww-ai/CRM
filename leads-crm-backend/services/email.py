import os
import smtplib
import urllib.request
import json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def send_welcome_credentials_email(
    to_email: str,
    full_name: str,
    default_password: str = "workfloww@2026",
    app_url: str = None
) -> bool:
    """
    Sends welcome credentials email to newly added team members.
    Supports SMTP, Resend API, and logs to console.
    """
    if not app_url:
        app_url = os.environ.get("FLOWWIES_APP_URL", "http://localhost:3000")

    subject = "Welcome to Flowwies — Your Login Credentials"

    text_content = f"""Hi {full_name},

Welcome to Flowwies HRMS for Workfloww.ai!

Your team account has been provisioned. Please log in using the credentials below:

- Login URL: {app_url}
- Username (Work Email): {to_email}
- Default Password: {default_password}

Security Notice: On your first login, Flowwies will prompt you to change your password before you can access the dashboard.

Best regards,
Flowwies Team
"""

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f6fd; margin: 0; padding: 24px; color: #1e1b4b; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border: 2px solid #1e1b4b; border-radius: 20px; padding: 32px; box-shadow: 6px 6px 0px #1e1b4b; }}
        .brand {{ font-size: 24px; font-weight: 800; color: #5a35ea; margin-bottom: 16px; }}
        .brand span {{ background: #dfd8fd; padding: 2px 8px; border-radius: 8px; margin-left: 4px; }}
        h1 {{ font-size: 20px; font-weight: 800; margin-top: 0; color: #1e1b4b; }}
        p {{ font-size: 14px; line-height: 1.6; color: #4b4869; margin: 12px 0; }}
        .box {{ background: #f2efff; border: 1.5px solid #5a35ea; border-radius: 14px; padding: 18px; margin: 20px 0; }}
        .row {{ margin-bottom: 10px; font-size: 14px; }}
        .row:last-child {{ margin-bottom: 0; }}
        .label {{ font-weight: 700; color: #1e1b4b; }}
        .val {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #5a35ea; background: #ffffff; padding: 2px 8px; border-radius: 6px; border: 1px solid #d4cbfb; display: inline-block; }}
        .btn {{ display: inline-block; background: #5a35ea; color: #ffffff !important; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 12px; border: 2px solid #1e1b4b; box-shadow: 3px 3px 0px #1e1b4b; margin-top: 14px; font-size: 14px; text-align: center; }}
        .badge {{ background: #fef08a; border: 1px solid #ca8a04; color: #854d0e; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; margin-top: 18px; display: block; }}
        .footer {{ text-align: center; font-size: 11px; color: #8b88a5; margin-top: 24px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">Flow<span>wies</span></div>
        <h1>Welcome to Flowwies, {full_name}! 👋</h1>
        <p>Your team account has been provisioned on Flowwies HRMS. You can now track your leaves, holidays, calendar, reimbursements, and recognition in one place.</p>
        
        <div class="box">
          <div class="row">
            <span class="label">Login Portal:</span><br>
            <a href="{app_url}" style="color: #5a35ea; font-weight: 700;">{app_url}</a>
          </div>
          <div class="row" style="margin-top: 10px;">
            <span class="label">Username (Email):</span><br>
            <span class="val">{to_email}</span>
          </div>
          <div class="row" style="margin-top: 10px;">
            <span class="label">Temporary Password:</span><br>
            <span class="val">{default_password}</span>
          </div>
        </div>

        <div class="badge">
          🔒 <strong>First-Time Login Requirement:</strong> For security, you will be required to choose a new password upon signing in.
        </div>

        <div style="text-align: center;">
          <a href="{app_url}" class="btn">Sign In to Flowwies &rarr;</a>
        </div>
      </div>
      <div class="footer">
        Flowwies Enterprise HRMS · Built for Workfloww.ai
      </div>
    </body>
    </html>
    """

    # Print log notice
    print("=" * 70)
    print("📧 [FLOWWIES EMAIL DISPATCH]")
    print(f"Recipient: {to_email} ({full_name})")
    print(f"Subject:   {subject}")
    print(f"Portal:    {app_url}")
    print(f"Username:  {to_email}")
    print(f"Password:  {default_password}")
    print("Security:  Mandatory password change enforced on first login")
    print("=" * 70)

    # 1. Try Resend if RESEND_API_KEY is configured
    resend_api_key = os.environ.get("RESEND_API_KEY")
    if resend_api_key:
        try:
            req_data = {
                "from": os.environ.get("RESEND_FROM", "Flowwies HRMS <onboarding@resend.dev>"),
                "to": [to_email],
                "subject": subject,
                "html": html_content,
                "text": text_content,
            }
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                if resp.status in (200, 201):
                    print("✓ Welcome email sent via Resend API")
                    return True
        except Exception as e:
            print("Notice: Resend API dispatch error:", e)

    # 2. Try SMTP if SMTP_HOST is configured
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    if smtp_host and smtp_user and smtp_pass:
        try:
            smtp_port = int(os.environ.get("SMTP_PORT", 587))
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = os.environ.get("SMTP_FROM", f"Flowwies HRMS <{smtp_user}>")
            msg["To"] = to_email

            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            print(f"✓ Welcome email sent via SMTP ({smtp_host}:{smtp_port}) to {to_email}")
            return True
        except Exception as e:
            print(f"Notice: SMTP dispatch error to {to_email}:", e)

    return True
