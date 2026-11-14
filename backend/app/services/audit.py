from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def audit(
    db: Session,
    action: str,
    *,
    user: User | None = None,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: Any = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Queue an audit entry on the current transaction (caller commits)."""
    db.add(
        AuditLog(
            user_id=user.id if user else user_id,
            action=action,
            entity_type=entity_type,
            entity_id=None if entity_id is None else str(entity_id),
            details=details,
            ip_address=ip,
        )
    )
