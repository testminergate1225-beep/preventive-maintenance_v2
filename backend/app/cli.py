"""Administrative commands.

    python -m app.cli create-admin --email you@example.com --name "Your Name"
    python -m app.cli import-users ../users.json [--send-invites]
    python -m app.cli invite --email someone@example.com
    python -m app.cli test-email --to you@example.com [--mailbox bom]
"""

import argparse
import getpass
import json
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db import SessionLocal, explain_connection_error
from app.models import ROLE_ADMIN, ROLES, User
from app.services import auth as auth_service
from app.services import email as mailer


def _parse_dt(v):
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(v)[:19], fmt)
        except ValueError:
            pass
    return None


def create_admin(args) -> int:
    password = args.password or getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        email = auth_service.normalize_email(args.email)
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role = ROLE_ADMIN
            user.is_active = True
            if args.name:
                user.full_name = args.name
            print(f"Updated existing user {email} -> admin, password reset.")
        else:
            user = User(email=email, full_name=args.name, role=ROLE_ADMIN, is_active=True)
            db.add(user)
            print(f"Created admin {email}.")
        auth_service.set_password(db, user, password)
        db.commit()
    return 0


def import_users(args) -> int:
    """Import the Firebase Auth export (users.json). Firebase password hashes are not
    exportable, so every imported user must set a password via an invite link."""
    data = json.loads(Path(args.path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("users", [])
    created = updated = 0
    with SessionLocal() as db:
        for u in data:
            email = auth_service.normalize_email(u.get("identifier") or u.get("email") or "")
            if "@" not in email:
                print(f"  skip: no e-mail in {u!r}")
                continue
            role = (u.get("role") or "user").lower()
            role = role if role in ROLES else "user"
            db.flush()  # make users added earlier in this loop visible (the export can repeat an e-mail)
            user = db.scalar(select(User).where(User.email == email))
            if user:
                user.full_name = user.full_name or u.get("full_name")
                if role == ROLE_ADMIN:  # never downgrade an admin because of a duplicate row
                    user.role = role
                updated += 1
            else:
                uid = (u.get("user_uid") or "")[:36]
                if not uid or db.scalar(select(User.id).where(User.uuid == uid)):
                    uid = None  # let the model generate a fresh UUID
                user = User(email=email, full_name=u.get("full_name") or email.split("@")[0], role=role, is_active=True,
                            **({"uuid": uid} if uid else {}))
                if created_at := _parse_dt(u.get("created")):
                    user.created_at = created_at
                db.add(user)
                created += 1
        db.commit()
        print(f"Imported users: {created} created, {updated} updated.")

        if args.send_invites:
            users = db.scalars(select(User).where(User.password_hash.is_(None), User.is_active.is_(True))).all()
            for user in users:
                link, emailed = auth_service.invite_user(db, user, ip=None)
                print(f"  {user.email}: {'invite e-mailed' if emailed else 'NOT e-mailed -> ' + link}")
    return 0


def invite(args) -> int:
    with SessionLocal() as db:
        user = auth_service.get_user_by_email(db, args.email)
        if not user:
            print("No such user.", file=sys.stderr)
            return 1
        link, emailed = auth_service.invite_user(db, user, ip=None)
        print("Invite e-mailed." if emailed else f"E-mail not sent. Link: {link}")
    return 0


def test_email(args) -> int:
    mb = mailer.bom_mailbox() if args.mailbox == "bom" else mailer.account_mailbox()
    print(f"[{args.mailbox}] SMTP {mb.host}:{mb.port} STARTTLS={mb.starttls} as {mb.username or '(no auth)'} "
          f"from {mb.from_name} <{mb.from_email}>")
    ok = mailer.send_email(args.to, "EPM System test e-mail", f"The {args.mailbox} SMTP settings are working.", mailbox=mb)
    print("Sent." if ok else "Failed - see log output above.")
    return 0 if ok else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("create-admin", help="Create (or promote) an administrator with a password")
    a.add_argument("--email", required=True)
    a.add_argument("--name")
    a.add_argument("--password", help="Omit to be prompted (recommended)")
    a.set_defaults(func=create_admin)

    i = sub.add_parser("import-users", help="Import users from the Firebase Auth users.json export")
    i.add_argument("path")
    i.add_argument("--send-invites", action="store_true", help="E-mail set-password links to users without a password")
    i.set_defaults(func=import_users)

    v = sub.add_parser("invite", help="Send a set-password link to one user")
    v.add_argument("--email", required=True)
    v.set_defaults(func=invite)

    t = sub.add_parser("test-email", help="Send a test e-mail (SMTP_* account mailbox, or BOM_SMTP_* with --mailbox bom)")
    t.add_argument("--to", required=True)
    t.add_argument("--mailbox", choices=["account", "bom"], default="account")
    t.set_defaults(func=test_email)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except OperationalError as e:
        hint = explain_connection_error(e)
        if not hint:
            raise
        print(f"ERROR: {hint}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
