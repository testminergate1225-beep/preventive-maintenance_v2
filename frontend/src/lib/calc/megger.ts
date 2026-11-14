import { MEGGER_KEYS, type MeggerCircuit, type MeggerKey } from "@/types";

/** Minimum acceptable insulation resistance (MΩ); any lower reading fails the circuit. */
export const PASS_THRESHOLD_MOHM = 350;

const DISABLED: Record<MeggerCircuit, MeggerKey[]> = {
  "3phase-delta": ["L1-N", "L2-N", "L3-N", "N-G"],
  "3phase-wye": [],
  "1phase-ll": ["L1-L3", "L2-L3", "L1-N", "L2-N", "L3-N", "L3-G", "N-G"],
  "1phase-ln": ["L1-L2", "L1-L3", "L2-L3", "L2-N", "L3-N", "L2-G", "L3-G"],
};

export function enabledKeys(circuit: MeggerCircuit): MeggerKey[] {
  return MEGGER_KEYS.filter((k) => !DISABLED[circuit].includes(k));
}

/** "Passed" / "Failed" from the readings that apply, or "" when nothing is entered. */
export function autoRemark(row: Partial<Record<MeggerKey, string>>, circuit: MeggerCircuit): "" | "Passed" | "Failed" {
  const values = enabledKeys(circuit)
    .map((k) => row[k])
    .filter((v): v is string => v !== undefined && v !== "")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (!values.length) return "";
  return values.some((v) => v < PASS_THRESHOLD_MOHM) ? "Failed" : "Passed";
}
