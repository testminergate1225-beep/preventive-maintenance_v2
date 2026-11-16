"""Recompute kva_total for Three Phase (Delta) load balancing records

kVA for Delta is now each phase-pair current × its own line-to-line voltage:
(I L1-L2 × V L1-L2 + I L1-L3 × V L1-L3 + I L2-L3 × V L2-L3) / 1000, where a blank
per-line voltage falls back to the system V(L-L). Previously it was √3 × V(L-L) × I
(single-phase) and V(L-L) × ΣI / √3 (three-phase). Other circuit types are unchanged.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16
"""
import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _delta_kva(loads, v_ll, v_l1l2, v_l1l3, v_l2l3):
    def volts(per_pair):
        return per_pair if per_pair and float(per_pair) > 0 else v_ll

    by_pair = {"AB": volts(v_l1l2), "CA": volts(v_l1l3), "BC": volts(v_l2l3)}
    total = 0.0
    for load in loads or []:
        phase = str(load.get("phase") or "").upper().replace(" ", "")
        if phase == "3PH":
            currents = (load.get("ia"), load.get("ib"), load.get("ic"))
            for amps, pair in zip(currents, ("AB", "CA", "BC")):
                if amps and by_pair[pair]:
                    total += float(amps) * float(by_pair[pair])
        elif phase in by_pair and by_pair[phase]:
            total += float(load.get("value") or 0) * float(by_pair[phase])
    total = round(total / 1000, 3)
    return total if total > 0 else None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, loads, v_ll, v_l1l2, v_l1l3, v_l2l3 FROM load_balancing_records WHERE circuit_type = 'three_delta'"
    )).mappings().all()
    for r in rows:
        loads = r["loads"]
        if isinstance(loads, (str, bytes)):
            loads = json.loads(loads)
        kva = _delta_kva(loads, r["v_ll"], r["v_l1l2"], r["v_l1l3"], r["v_l2l3"])
        bind.execute(sa.text("UPDATE load_balancing_records SET kva_total = :k WHERE id = :id"), {"k": kva, "id": r["id"]})
    print(f"  recomputed kva_total for {len(rows)} Delta record(s)")


def downgrade() -> None:
    # Values are derived from stored loads/voltages; nothing to restore.
    pass
