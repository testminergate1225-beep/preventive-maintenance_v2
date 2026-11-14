"""Outgoing e-mail over SMTP (STARTTLS). Credentials come exclusively from environment variables."""

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import get_settings

log = logging.getLogger("app.email")


def send_email(to: str, subject: str, text: str, html_body: str | None = None) -> bool:
    s = get_settings()
    if not s.smtp_enabled:
        log.warning("SMTP is not configured; e-mail to %s not sent. Subject: %s\n%s", to, subject, text)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((s.smtp_from_name, s.smtp_from_email))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=s.smtp_from_email.split("@")[-1])
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=s.smtp_timeout_seconds) as smtp:
            smtp.ehlo()
            if s.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if s.smtp_username:
                smtp.login(s.smtp_username, s.smtp_password)
            smtp.send_message(msg)
        log.info("Sent e-mail '%s' to %s", subject, to)
        return True
    except (smtplib.SMTPException, OSError):
        log.exception("Failed to send e-mail '%s' to %s", subject, to)
        return False


def _layout(title: str, intro: str, button_label: str, link: str, footer: str) -> str:
    e = html.escape
    return f"""<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0f172a;padding:20px 28px;color:#f8fafc;font-size:18px;font-weight:700">
          &#9881; EPM System
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px">{e(title)}</h1>
          <p style="margin:0 0 22px;line-height:1.55;color:#334155">{e(intro)}</p>
          <p style="margin:0 0 22px"><a href="{e(link)}" style="display:inline-block;background:#f59e0b;color:#111827;
             text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">{e(button_label)}</a></p>
          <p style="margin:0 0 6px;font-size:13px;color:#64748b">If the button doesn't work, paste this link into your browser:</p>
          <p style="margin:0 0 22px;font-size:12px;word-break:break-all;color:#475569">{e(link)}</p>
          <p style="margin:0;font-size:13px;color:#64748b">{e(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def send_password_reset(to: str, name: str | None, link: str, minutes: int) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\nWe received a request to reset your EPM System password.\n"
        f"Open this link to choose a new password (valid for {minutes} minutes, single use):\n\n{link}\n\n"
        "If you didn't request this, you can ignore this e-mail — your password won't change."
    )
    body = _layout(
        "Reset your password",
        f"{greeting} we received a request to reset your password. This link is valid for {minutes} minutes and can be used once.",
        "Choose a new password",
        link,
        "If you didn't request a password reset, you can safely ignore this e-mail.",
    )
    return send_email(to, "Reset your EPM System password", text, body)


def send_invite(to: str, name: str | None, link: str, hours: int) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\nAn account has been created for you on the EPM System.\n"
        f"Open this link to set your password (valid for {hours} hours, single use):\n\n{link}\n"
    )
    body = _layout(
        "Set up your account",
        f"{greeting} an EPM System account has been created for you. Set your password to get started — this link is valid for {hours} hours.",
        "Set my password",
        link,
        "If you weren't expecting this invitation, you can ignore this e-mail.",
    )
    return send_email(to, "Your EPM System account", text, body)
