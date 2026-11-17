"""Outgoing e-mail over SMTP (STARTTLS). Credentials come exclusively from environment variables."""

import html
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import get_settings

log = logging.getLogger("app.email")


@dataclass(frozen=True)
class Mailbox:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    from_name: str
    starttls: bool

    @property
    def enabled(self) -> bool:
        return bool(self.host and self.from_email)


def account_mailbox() -> Mailbox:
    """Password-reset / invite mailbox (SMTP_*)."""
    s = get_settings()
    return Mailbox(s.smtp_host, s.smtp_port, s.smtp_username, s.smtp_password, s.smtp_from_email, s.smtp_from_name, s.smtp_starttls)


def bom_mailbox() -> Mailbox:
    """Preventive-maintenance mailbox used for Bill of Materials e-mails (BOM_SMTP_*)."""
    s = get_settings()
    return Mailbox(s.bom_smtp_host, s.bom_smtp_port, s.bom_smtp_username, s.bom_smtp_password,
                   s.bom_smtp_from_email, s.bom_smtp_from_name, s.bom_smtp_starttls)


def send_email(to: str, subject: str, text: str, html_body: str | None = None, *,
               mailbox: Mailbox | None = None, cc: list[str] | None = None) -> bool:
    mb = mailbox or account_mailbox()
    if not mb.enabled:
        log.warning("SMTP is not configured; e-mail to %s not sent. Subject: %s\n%s", to, subject, text)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((mb.from_name, mb.from_email))
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Message-ID"] = make_msgid(domain=mb.from_email.split("@")[-1])
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(mb.host, mb.port, timeout=get_settings().smtp_timeout_seconds) as smtp:
            smtp.ehlo()
            if mb.starttls:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if mb.username:
                smtp.login(mb.username, mb.password)
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


def send_bom(to: str, cc: list[str], *, bom_number: str, revision: int, branch: str, checklist_ref: str | None,
             item_count: int, prepared_by: str | None, link: str, expires: str) -> bool:
    """E-mail a finalized Bill of Materials as a secure, expiring PDF link (no attachment)."""
    e = html.escape
    rev = f" (revision {revision})" if revision > 1 else ""
    subject = f"Bill of Materials {bom_number}{rev} – {branch}"
    text = (
        f"Good day,\n\nPlease find the Bill of Materials {bom_number}{rev} for {branch}"
        f"{f' (PM checklist {checklist_ref})' if checklist_ref else ''}.\n"
        f"It lists {item_count} material item(s) needed after the preventive maintenance inspection.\n\n"
        f"Download the PDF (link valid until {expires}):\n{link}\n\n"
        f"{f'Prepared by: {prepared_by}' if prepared_by else ''}\n\n— Preventive Maintenance"
    )
    rows = "".join(
        f'<tr><td style="padding:6px 0;color:#64748b;width:140px">{e(k)}</td><td style="padding:6px 0;font-weight:600">{e(v)}</td></tr>'
        for k, v in [("BOM no.", f"{bom_number}{rev}"), ("Store / branch", branch), ("PM checklist", checklist_ref or "—"),
                     ("Material items", str(item_count)), ("Prepared by", prepared_by or "—")]
    )
    body = f"""<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0f172a;padding:20px 28px;color:#f8fafc">
          <div style="font-size:18px;font-weight:700">&#9881; Preventive Maintenance</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">Electrical Preventive Maintenance System</div>
        </td></tr>
        <tr><td style="height:5px;background:repeating-linear-gradient(-45deg,#f59e0b 0 10px,#111827 10px 20px);background-color:#f59e0b"></td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 6px;font-size:20px">Bill of Materials</h1>
          <p style="margin:0 0 18px;line-height:1.55;color:#334155">Good day. Following the preventive maintenance inspection at
            <b>{e(branch)}</b>, the materials below are needed to correct the items found <b>NOT OK</b>.</p>
          <table role="presentation" width="100%" style="font-size:14px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 22px">{rows}</table>
          <p style="margin:0 0 22px"><a href="{e(link)}" style="display:inline-block;background:#f59e0b;color:#111827;
             text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Download the BOM (PDF)</a></p>
          <p style="margin:0 0 6px;font-size:13px;color:#64748b">This secure link is valid until <b>{e(expires)}</b>. If the button doesn't work, paste this into your browser:</p>
          <p style="margin:0 0 22px;font-size:12px;word-break:break-all;color:#475569">{e(link)}</p>
          <p style="margin:0;font-size:13px;color:#64748b">This is an automated message from the Preventive Maintenance team. Please reply to your PM coordinator with any questions.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
    return send_email(to, subject, text, body, mailbox=bom_mailbox(), cc=cc)


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
