"""Recompute kva_total for Three Phase (Wye) load balancing records

kVA for Wye is now the sum of each phase load × its own line-to-neutral voltage
(AN × V L1-N, BN × V L2-N, CN × V L3-N) / 1000, with no kVA for the neutral current.
Previously it was √3 × V(L-L) × ΣI / 1000 (including the neutral). Other circuit
types are unchanged.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-15
"""
import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _wye_kva(loads, v_ln, v_l1n, v_l2n, v_l3n):
    per_line = {"AN": v_l1n, "BN": v_l2n, "CN": v_l3n}
    total = 0.0
    for load in loads or []:
        phase = str(load.get("phase") or "").upper().replace(" ", "")
        if phase not in per_line:
            continue  # neutral current: no kVA
        volts = per_line[phase] if per_line[phase] and float(per_line[phase]) > 0 else v_ln
        if volts:
            total += float(load.get("value") or 0) * float(volts) / 1000
    total = round(total, 3)
    return total if total > 0 else None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, loads, v_ln, v_l1n, v_l2n, v_l3n FROM load_balancing_records WHERE circuit_type = 'three_wye'"
    )).mappings().all()
    changed = 0
    for r in rows:
        loads = r["loads"]
        if isinstance(loads, (str, bytes)):
            loads = json.loads(loads)
        kva = _wye_kva(loads, r["v_ln"], r["v_l1n"], r["v_l2n"], r["v_l3n"])
        bind.execute(sa.text("UPDATE load_balancing_records SET kva_total = :k WHERE id = :id"), {"k": kva, "id": r["id"]})
        changed += 1
    print(f"  recomputed kva_total for {changed} Wye record(s)")


def downgrade() -> None:
    # Values are derived from stored loads/voltages; nothing to restore. Re-saving a
    # record under the previous code version would recompute the old way.
    pass
