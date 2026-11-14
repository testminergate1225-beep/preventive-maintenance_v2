"""Derived values computed on the server so stored totals always match the raw data.

These mirror the formulas used by the field forms (ported from the original pages);
the frontend has an identical TypeScript implementation for live previews.
"""

import math
from typing import Any

PHASE_KEYS = {
    "three_wye": ["AN", "BN", "CN", "N"],
    "three_delta": ["AB", "BC", "CA"],
    "single_ll": ["L1", "L2"],
}


def load_balancing_totals(circuit_type: str | None, loads: list[dict[str, Any]], v_ll, v_ln, v_ph) -> dict[str, float | None]:
    keys = PHASE_KEYS.get(circuit_type or "", ["L1"])
    totals: dict[str, float] = {k: 0.0 for k in keys}
    for load in loads:
        phase = str(load.get("phase") or "")
        totals[phase] = totals.get(phase, 0.0) + float(load.get("value") or 0)

    ordered = list(totals.values())
    a = ordered[0] if len(ordered) > 0 else 0.0
    b = ordered[1] if len(ordered) > 1 else 0.0
    c = ordered[2] if len(ordered) > 2 else 0.0
    total = sum(ordered)

    # kVA = factor × V × ΣI / 1000 — voltage choice depends on the circuit configuration.
    if circuit_type == "single_ln":
        volts = v_ln
    elif circuit_type == "single_ll":
        volts = v_ph
    else:  # single_llc, three_wye, three_delta
        volts = v_ll
    factor = math.sqrt(3) if circuit_type in ("three_wye", "three_delta") else 1.0
    sum_i = sum(float(load.get("value") or 0) for load in loads)
    kva = round(factor * float(volts) * sum_i / 1000, 3) if volts and loads and sum_i > 0 else None

    return {
        "phase_a": round(a, 2),
        "phase_b": round(b, 2),
        "phase_c": round(c, 2),
        "total_load": round(total, 2),
        "kva_total": kva if kva and kva > 0 else None,
    }


def store_list_totals(snapshot: dict[str, Any]) -> dict[str, int]:
    """Counting rules from the store list page.

    Every entry counts towards redemption unless flagged `noRedemption`;
    Main/Sat counts come from `storeType`.
    """
    areas = snapshot.get("areas") or []
    main = sat = redemption = 0
    for area in areas:
        for e in area.get("entries") or []:
            if not e.get("noRedemption"):
                redemption += 1
            if e.get("storeType") == "main":
                main += 1
            elif e.get("storeType") == "sat":
                sat += 1
    return {"total_main": main, "total_sat": sat, "total_redemption": redemption, "total_areas": len(areas)}
