"""Derived values computed on the server so stored totals always match the raw data.

These mirror the formulas used by the field forms (ported from the original pages);
the frontend has an identical TypeScript implementation for live previews.
"""

from typing import Any

PHASE_KEYS = {
    "three_wye": ["AN", "BN", "CN", "N"],
    "three_delta": ["AB", "BC", "CA"],
    "single_ll": ["L1", "L2"],
}


def _ln_voltage(per_line, main):
    """Per-line L-N voltage if entered, otherwise the system V(L-N)."""
    return per_line if per_line and per_line > 0 else main


# Delta phase pairs → per-line L-L voltage column (AB = L1-L2, CA = L1-L3, BC = L2-L3).
DELTA_VOLTAGE = {"AB": "v_l1l2", "CA": "v_l1l3", "BC": "v_l2l3"}


def _delta_voltage(pair: str, v: dict[str, Any]):
    """Per-pair L-L voltage if entered, otherwise the system V(L-L)."""
    key = DELTA_VOLTAGE.get(pair)
    return _ln_voltage(v.get(key), v.get("v_ll")) if key else None


THREE_PHASE = "3PH"
# Summary buckets a three-phase load's (ia, ib, ic) add into. Delta follows the
# printed columns: L1-L2 = AB, L1-L3 = CA, L2-L3 = BC.
THREE_PHASE_KEYS = {"three_wye": ("AN", "BN", "CN"), "three_delta": ("AB", "CA", "BC")}


def _currents(load: dict[str, Any]) -> tuple[float, float, float]:
    return tuple(float(load.get(k) or 0) for k in ("ia", "ib", "ic"))  # type: ignore[return-value]


def load_kva(load: dict[str, Any], circuit_type: str | None, v: dict[str, Any]) -> float | None:
    """kVA of one circuit load.

    Three-phase Wye: each phase uses its own line-to-neutral voltage
    (AN × V L1-N, BN × V L2-N, CN × V L3-N) / 1000; the neutral current has no kVA.
    Three-phase Delta: each phase-pair current uses its own line-to-line voltage
    (L1-L2 × V L1-L2 + L1-L3 × V L1-L3 + L2-L3 × V L2-L3) / 1000.
    Other configurations keep the original form's formula.
    """
    if load.get("phase") == THREE_PHASE:
        i1, i2, i3 = _currents(load)
        if circuit_type == "three_wye":
            total = (i1 * float(_ln_voltage(v.get("v_l1n"), v.get("v_ln")) or 0)
                     + i2 * float(_ln_voltage(v.get("v_l2n"), v.get("v_ln")) or 0)
                     + i3 * float(_ln_voltage(v.get("v_l3n"), v.get("v_ln")) or 0))
            return total / 1000 if total > 0 else None
        if circuit_type == "three_delta":
            # (I L1-L2 × V L1-L2 + I L1-L3 × V L1-L3 + I L2-L3 × V L2-L3) / 1000
            total = sum(i * float(_delta_voltage(pair, v) or 0) for i, pair in zip((i1, i2, i3), ("AB", "CA", "BC")))
            return total / 1000 if total > 0 else None
        return None
    amps = float(load.get("value") or 0)
    if not amps:
        return None
    if circuit_type == "three_delta":
        volts = _delta_voltage(str(load.get("phase") or "").upper().replace(" ", ""), v)
        return amps * float(volts) / 1000 if volts else None
    if circuit_type == "three_wye":
        phase = str(load.get("phase") or "").upper().replace(" ", "")
        per_line = {"AN": v.get("v_l1n"), "BN": v.get("v_l2n"), "CN": v.get("v_l3n")}
        if phase not in per_line:
            return None
        volts = _ln_voltage(per_line[phase], v.get("v_ln"))
        return amps * float(volts) / 1000 if volts else None
    if circuit_type == "single_ln":
        volts = v.get("v_ln")
    elif circuit_type == "single_ll":
        volts = v.get("v_ph")
    else:  # single_llc
        volts = v.get("v_ll")
    return float(volts) * amps / 1000 if volts else None


def load_balancing_totals(circuit_type: str | None, loads: list[dict[str, Any]], voltages: dict[str, Any]) -> dict[str, float | None]:
    keys = PHASE_KEYS.get(circuit_type or "", ["L1"])
    totals: dict[str, float] = {k: 0.0 for k in keys}
    for load in loads:
        phase = str(load.get("phase") or "")
        if phase == THREE_PHASE and circuit_type in THREE_PHASE_KEYS:
            for key, amps in zip(THREE_PHASE_KEYS[circuit_type], _currents(load)):
                totals[key] = totals.get(key, 0.0) + amps
        else:
            totals[phase] = totals.get(phase, 0.0) + float(load.get("value") or 0)

    ordered = list(totals.values())
    a = ordered[0] if len(ordered) > 0 else 0.0
    b = ordered[1] if len(ordered) > 1 else 0.0
    c = ordered[2] if len(ordered) > 2 else 0.0
    total = sum(ordered)

    kva = round(sum(load_kva(load, circuit_type, voltages) or 0 for load in loads), 3)

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
