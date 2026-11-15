import { describe, expect, it } from "vitest";
import { computeSummary, fullLoadTest, kvaTotal, loadKva, printReport, rowKva, supportsThreePhaseLoads } from "./loadBalancing";
import { autoRemark } from "./megger";
import { groupKey, individualCounts, teamCounts } from "./performers";
import { computeStoreSummary, isFilled, normalizeSnapshot } from "./storeList";

const V = { vLl: 400, vLn: 230, vPh: null, vL1l2: null, vL1l3: null, vL2l3: null, vL1n: null, vL2n: null, vL3n: null };

describe("load balancing", () => {
  const loads = [
    { name: "#1", value: 10, phase: "AN" },
    { name: "#2", value: 12.5, phase: "BN" },
    { name: "#3", value: 7.5, phase: "CN" },
    { name: "Neutral Current", value: 2, phase: "N" },
  ];

  it("summarises phases like the original form (total includes the neutral bucket)", () => {
    const s = computeSummary("three_wye", loads);
    expect([s.a, s.b, s.c]).toEqual([10, 12.5, 7.5]);
    expect(s.total).toBe(32);
    expect(s.average).toBe(10); // phases only: (10 + 12.5 + 7.5) / 3 — neutral excluded
    expect(s.imbalancePct).toBeCloseTo(25);
    expect(s.suggestions.some((x) => x.to === "N" || x.from === "N")).toBe(false);
  });

  it("wye kVA = I x own L-N voltage per phase; neutral has no kVA", () => {
    // AN 10 A, BN 12.5 A, CN 7.5 A at 230 V; neutral 2 A ignored
    expect(kvaTotal("three_wye", loads, V)).toBe(Math.round((10 + 12.5 + 7.5) * 230) / 1000);
    // Per-line L-N voltages override the system V(L-N)
    const perLine = { ...V, vL1n: 231, vL2n: 229, vL3n: 0 };
    expect(loadKva(loads[0], "three_wye", perLine)).toBeCloseTo((10 * 231) / 1000);
    expect(loadKva(loads[1], "three_wye", perLine)).toBeCloseTo((12.5 * 229) / 1000);
    expect(loadKva(loads[2], "three_wye", perLine)).toBeCloseTo((7.5 * 230) / 1000); // L3-N blank -> falls back to 230
    expect(loadKva(loads[3], "three_wye", perLine)).toBeNull();
    const rep = printReport("three_wye", loads, perLine);
    expect(rep.rows.find((r) => r.description === "Neutral Current")?.kva).toBeNull();
    expect(rep.totKva).toBeCloseTo((10 * 231 + 12.5 * 229 + 7.5 * 230) / 1000);
  });

  it("other configurations keep the original formulas", () => {
    expect(kvaTotal("single_ln", [{ name: "a", value: 10, phase: "L1_N" }], V)).toBe(2.3);
    expect(rowKva(10, "single_ll", 999, 999, 240)).toBeCloseTo(2.4);
    expect(kvaTotal("three_delta", [{ name: "a", value: 10, phase: "AB" }], V)).toBe(Math.round(Math.sqrt(3) * 400 * 10) / 1000);
    expect(kvaTotal("three_delta", [], V)).toBeNull();
  });

  it("suggests moving loads from heaviest to lightest phase", () => {
    const s = computeSummary("three_delta", [
      { name: "big", value: 30, phase: "AB" }, { name: "small", value: 5, phase: "AB" }, { name: "x", value: 10, phase: "BC" },
    ]);
    expect(s.suggestions[0]).toMatchObject({ name: "big", from: "AB", to: "CA" });
  });

  it("computes the neutral vector sum and harmonics flag for wye", () => {
    const r = printReport("three_wye", [{ name: "a", value: 10, phase: "AN" }, { name: "b", value: 10, phase: "BN" },
      { name: "c", value: 10, phase: "CN" }, { name: "Neutral Current", value: 3, phase: "N" }], V);
    expect(r.neutralMagnitude).toBeCloseTo(0, 6);
    expect(r.verdict).toBe("Balanced");
    expect(r.rows.find((x) => x.description === "Neutral Current")?.remark).toBe("Suspected Harmonics");
    expect(r.rows[0].description).toBe("Neutral Current"); // newest first
  });

  it("flags delta imbalance above 20%", () => {
    const r = printReport("three_delta", [{ name: "a", value: 10, phase: "AB" }, { name: "b", value: 20, phase: "BC" },
      { name: "c", value: 10, phase: "CA" }], V);
    expect(r.verdict).toBe("Unbalanced");
    expect(r.showNeutral).toBe(false);
  });

  it("full load test (wye per-phase power)", () => {
    const t = fullLoadTest("three_wye", { nameplateKw: 10, van: 230, vbn: 230, vcn: 230, ia: 10, ib: 10, ic: 10, pfA: 1, pfB: null, pfC: 1 });
    expect(t.total).toBeCloseTo(6.9);
    expect(t.pct).toBeCloseTo(69);
  });
});

describe("megger", () => {
  it("fails any applicable reading below 350 MΩ and ignores disabled columns", () => {
    expect(autoRemark({ "L1-L2": "500", "L1-G": "349" }, "3phase-wye")).toBe("Failed");
    expect(autoRemark({ "L1-L2": "500", "L1-N": "10" }, "3phase-delta")).toBe("Passed"); // L1-N disabled for delta
    expect(autoRemark({}, "3phase-wye")).toBe("");
  });
});

describe("performers", () => {
  it("groups pairs regardless of order and old spellings", () => {
    expect(groupKey("Joseph Cristal / Johny Austria")).toBe("johny austria|joseph cristal jr");
    expect(groupKey("Chris Neri")).toBeNull();
    const rows = [
      { performedBy: "Johny Austria / Joseph Cristal", count: 3 },
      { performedBy: "Joseph Cristal Jr / Johny Austria", count: 2 },
      { performedBy: "Joseph Cristal Jr", count: 1 },
    ];
    expect(teamCounts(rows)[0].value).toBe(5);
    expect(individualCounts(rows).find((i) => i.label === "Joseph Cristal Jr")?.value).toBe(6);
  });
});

describe("store list", () => {
  it("normalises partial snapshots saved by the old app", () => {
    const snap = normalizeSnapshot({ areas: [{ id: "a", name: "NORTH 1", entries: [{ id: "e1", storeType: "main", branchName: null }, { id: "e2", branchCode: "TW-9" }] }] });
    const [e1, e2] = snap.areas[0].entries;
    expect(e1.branchName).toBe("");
    expect(e1.noRedemption).toBe(false);
    expect(isFilled(e2)).toBe(true);
    expect(computeStoreSummary(snap).main).toBe(1);
    expect(normalizeSnapshot(null).areas).toEqual([]);
  });

  it("numbers main/sat per area and counts redemption unless excluded", () => {
    const e = (id: string, extra: object = {}) => ({ id, storeType: "", noRedemption: false, plCode: "", branchCode: "", branchName: "",
      sqm: "", tradeName: "", tw: "", fh: "", gotcha: "", austin: "", adams: "", jacks: "", company: "", lastPmDate: "", conductedBy: "", ...extra }) as any;
    const s = computeStoreSummary({ areas: [
      { id: "a", name: "N1", locked: true, entries: [e("1", { storeType: "main", tradeName: "Tom's World / Funhouse" }), e("2", { storeType: "main" })] },
      { id: "b", name: "N2", locked: true, entries: [e("3", { storeType: "main", noRedemption: true, tradeName: "Funhouse" })] },
    ] });
    expect([s.main, s.sat, s.redemption]).toEqual([3, 0, 2]);
    expect(s.rows.get("3")?.main).toBe(1); // restarts per area
    expect(s.brandCounts.fh).toBe(2);
    expect(s.rows.get("3")?.brands.fh).toBe(2);
  });
});

describe("three-phase loads", () => {
  const motor = { name: "ACCU-1", value: 22, phase: "3PH", ia: 10, ib: 12, ic: 0 };
  it("wye: currents add to AN/BN/CN, kVA per line with own L-N voltage", () => {
    const s = computeSummary("three_wye", [motor, { name: "#1", value: 5, phase: "AN" }]);
    expect([s.a, s.b, s.c]).toEqual([15, 12, 0]);
    expect(s.suggestions.every((x) => x.name !== "ACCU-1")).toBe(true); // 3-phase loads are never moved
    expect(loadKva(motor, "three_wye", { ...V, vL2n: 231 })).toBeCloseTo((10 * 230 + 12 * 231) / 1000);
    const r = printReport("three_wye", [motor], V);
    expect(r.rows[0]).toMatchObject({ description: "ACCU-1 (3Φ)", l1: 10, l2: 12, l3: null, n: null });
  });
  it("delta: L1-L2/L1-L3/L2-L3 map to AB/CA/BC; balanced kVA = √3·V·I", () => {
    const m = { name: "M", value: 30, phase: "3PH", ia: 10, ib: 10, ic: 10 };
    expect(loadKva(m, "three_delta", V)).toBeCloseTo((Math.sqrt(3) * 400 * 10) / 1000);
    const s = computeSummary("three_delta", [{ ...m, ia: 1, ib: 2, ic: 3 }]);
    expect(s.totals).toMatchObject({ AB: 1, CA: 2, BC: 3 });
    expect(printReport("three_delta", [{ ...m, ia: 1, ib: 2, ic: 3 }], V).rows[0]).toMatchObject({ l1: 1, l2: 2, l3: 3 });
  });
  it("is only offered on three-phase systems", () => {
    expect(supportsThreePhaseLoads("three_wye") && supportsThreePhaseLoads("three_delta")).toBe(true);
    expect(["single_ln", "single_llc", "single_ll"].some((c) => supportsThreePhaseLoads(c as never))).toBe(false);
  });
});

describe("load balancing print columns", () => {
  it("puts only true neutral readings in the N column", () => {
    const r = printReport("three_wye", [{ name: "a", value: 12.5, phase: "BN" }, { name: "Neutral Current", value: 2, phase: "N" }], V);
    expect(r.rows.find((x) => x.description === "a")).toMatchObject({ l2: 12.5, n: null });
    expect(r.rows.find((x) => x.description === "Neutral Current")?.n).toBe(2);
    const s = printReport("single_ln", [{ name: "x", value: 5, phase: "L1_N" }], V);
    expect(s.rows[0]).toMatchObject({ l1: 5, n: null });
  });
});
