"""
Email Service — sends transactional emails via SendGrid.

Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env.
When keys are missing, emails are logged to stdout for local dev.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any


def _sendgrid_client():
    try:
        import sendgrid  # noqa: F811
        from sendgrid.helpers.mail import Content, Email, Mail, To  # noqa: F401
    except ImportError:
        return None, None
    key = os.getenv("SENDGRID_API_KEY", "")
    if not key:
        return None, None
    return sendgrid.SendGridAPIClient(api_key=key), {
        "Email": Email,
        "To": To,
        "Content": Content,
        "Mail": Mail,
    }


def _smtp_config() -> dict[str, Any] | None:
    """Return SMTP config when credentials are available."""
    host = (os.getenv("SMTP_HOST", "") or "smtp.gmail.com").strip()
    port_raw = (os.getenv("SMTP_PORT", "") or "587").strip()
    username = (
        os.getenv("SMTP_USERNAME", "").strip()
        or os.getenv("SMTP_USER", "").strip()
        or os.getenv("SENDGRID_FROM_EMAIL", "").strip()
        or "burnerwill111@gmail.com"
    )
    password = (
        os.getenv("SMTP_PASSWORD", "").strip()
        or os.getenv("SMTP_PASS", "").strip()
        or os.getenv("GMAIL_APP_PASSWORD", "").strip()
    )
    if password:
        password = password.replace(" ", "")
    if not host or not username or not password:
        return None
    try:
        port = int(port_raw)
    except ValueError:
        port = 587
    from_email = (
        os.getenv("SMTP_FROM_EMAIL", "").strip()
        or os.getenv("SENDGRID_FROM_EMAIL", "").strip()
        or username
    )
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
    }


def _send_smtp(*, to: str, subject: str, html_body: str, config: dict[str, Any]) -> dict[str, Any]:
    msg = EmailMessage()
    msg["From"] = config["from_email"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("This email requires HTML support.")
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(config["host"], config["port"], timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(config["username"], config["password"])
            server.send_message(msg)
        return {"sent": True, "provider": "smtp"}
    except Exception as exc:
        return {"sent": False, "provider": "smtp", "detail": str(exc)}


def send_email(*, to: str, subject: str, html_body: str) -> dict[str, Any]:
    """
    Send a single email. Returns {"sent": True/False, "detail": ...}.
    Falls back to console logging when SendGrid is not configured.
    """
    smtp = _smtp_config()
    if smtp is not None:
        return _send_smtp(to=to, subject=subject, html_body=html_body, config=smtp)

    client, helpers = _sendgrid_client()
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "burnerwill111@gmail.com")
    if client is not None:
        mail = helpers["Mail"](
            from_email=helpers["Email"](from_email),
            to_emails=helpers["To"](to),
            subject=subject,
            html_content=helpers["Content"]("text/html", html_body),
        )
        try:
            response = client.send(mail)
            return {"sent": True, "status_code": response.status_code, "provider": "sendgrid"}
        except Exception as exc:
            return {"sent": False, "detail": str(exc), "provider": "sendgrid"}

    print(f"[EMAIL-DEV] To={to}  Subject={subject}")
    print(f"[EMAIL-DEV] Body preview: {html_body[:200]}")
    return {
        "sent": False,
        "detail": "No email provider configured (SendGrid/SMTP) — logged to console",
    }


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------


def send_weekly_summary(
    *,
    to: str,
    user_name: str,
    tenant_name: str = "AuraFit",
    week_start: str,
    week_end: str,
    summary: dict[str, Any],
    branding: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build and send a weekly engagement summary email."""
    branding = branding or {}
    primary_color = branding.get("primary_color") or "#333333"
    secondary_color = branding.get("secondary_color") or "#f5f5f5"
    logo_url = branding.get("logo_url")

    workouts = summary.get("workouts", {})
    nutrition = summary.get("nutrition", {})
    body_metrics = summary.get("body_metrics", {})
    goals = summary.get("goals", {})

    def _fmt(raw, suffix: str = "") -> str:
        if raw is None:
            return "N/A"
        return f"{raw}{suffix}"

    logo_markup = (
        f'<img src="{logo_url}" alt="{tenant_name} logo" style="height:42px;max-width:180px;object-fit:contain;" />'
        if logo_url
        else f'<span style="font-size:20px;font-weight:700;color:{primary_color};">{tenant_name}</span>'
    )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;background:#ffffff;color:#333333;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
        {logo_markup}
        <div style="font-size:12px;color:#666666;text-align:right;">
          <div><strong>Weekly Engagement Summary</strong></div>
          <div>{week_start} to {week_end}</div>
        </div>
      </div>
      <h2 style="margin:0 0 8px;color:{primary_color};">Hi {user_name}, here is your weekly progress</h2>
      <p style="margin:0 0 16px;color:#555555;">
        Your coach at <strong>{tenant_name}</strong> shared your latest weekly summary.
      </p>

      <div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin-bottom:12px;">
        <div style="padding:10px 14px;background:{secondary_color};font-weight:700;">Workouts</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Sessions this week</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(workouts.get("weekly_sessions"))}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Active days this week</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(workouts.get("weekly_active_days"))}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Current streak</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(workouts.get("current_streak_days"), " days")}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin-bottom:12px;">
        <div style="padding:10px 14px;background:{secondary_color};font-weight:700;">Nutrition</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Meal logs this week</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(nutrition.get("meal_logs"))}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Avg calories</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(nutrition.get("avg_calories"), " kcal")}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Avg protein</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(nutrition.get("avg_protein_g"), " g")}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin-bottom:12px;">
        <div style="padding:10px 14px;background:{secondary_color};font-weight:700;">Body Metrics</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Latest weight</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(body_metrics.get("latest_weight_lbs"), " lbs")}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Weekly weight change</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(body_metrics.get("weight_change_weekly_lbs"), " lbs")}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Latest body fat</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(body_metrics.get("latest_body_fat_pct"), "%")}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <div style="padding:10px 14px;background:{secondary_color};font-weight:700;">Goals</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Total goals</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(goals.get("total_goals"))}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Open goals</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(goals.get("open_goals"))}</td></tr>
          <tr><td style="padding:10px 14px;border-top:1px solid #f0f0f0;">Completed goals</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0;text-align:right;">{_fmt(goals.get("completed_goals"))}</td></tr>
        </table>
      </div>

      <p style="margin:0;color:#666666;font-size:12px;">Keep going. Consistency each week drives long-term results.</p>
      <p style="margin:6px 0 0;color:#666666;font-size:12px;">— {tenant_name}</p>
    </div>
    """
    return send_email(
        to=to,
        subject=f"Your {tenant_name} Weekly Summary ({week_start} - {week_end})",
        html_body=html,
    )


def send_streak_milestone(
    *,
    to: str,
    user_name: str,
    streak: int,
    badge_label: str,
) -> dict[str, Any]:
    """Notify the user when they unlock a new streak badge."""
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;text-align:center;">
      <h2 style="color:#6c63ff;">New Badge Unlocked!</h2>
      <p style="font-size:48px;margin:8px 0;">🏆</p>
      <p>Congratulations {user_name}!</p>
      <p>You've earned the <strong>{badge_label}</strong> badge with a
         <strong>{streak}-day</strong> workout streak.</p>
      <p>Keep pushing!</p>
    </div>
    """
    return send_email(
        to=to,
        subject=f"You earned the {badge_label} badge!",
        html_body=html,
    )
