import { describe, expect, it } from "vitest";
import { computeSummary, fullLoadTest, kvaTotal, printReport, rowKva } from "./loadBalancing";
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
    expect(s.average).toBe(8); // total / max(3, 4 keys)
  });

  it("matches the server kVA formula", () => {
    expect(kvaTotal("three_wye", loads, 400, 230, null)).toBe(Math.round(Math.sqrt(3) * 400 * 32) / 1000);
    expect(kvaTotal("single_ln", [{ name: "a", value: 10, phase: "L1_N" }], null, 230, null)).toBe(2.3);
    expect(rowKva(10, "single_ll", 999, 999, 240)).toBeCloseTo(2.4);
    expect(kvaTotal("three_delta", [], 400, null, null)).toBeNull();
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

describe("load balancing print columns", () => {
  it("puts only true neutral readings in the N column", () => {
    const r = printReport("three_wye", [{ name: "a", value: 12.5, phase: "BN" }, { name: "Neutral Current", value: 2, phase: "N" }], V);
    expect(r.rows.find((x) => x.description === "a")).toMatchObject({ l2: 12.5, n: null });
    expect(r.rows.find((x) => x.description === "Neutral Current")?.n).toBe(2);
    const s = printReport("single_ln", [{ name: "x", value: 5, phase: "L1_N" }], V);
    expect(s.rows[0]).toMatchObject({ l1: 5, n: null });
  });
});
