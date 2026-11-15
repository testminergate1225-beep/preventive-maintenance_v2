import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cable, Download, FileUp, Gauge, Lightbulb, PenLine, Plus, Printer, RotateCcw, Save, Sparkles, Trash2, Wand2, Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useDialogs } from "@/components/ui/Modal";
import { Badge, Segmented } from "@/components/ui/Surface";
import { CIRCUIT_TYPES } from "@/config/options";
import { api, errorMessage } from "@/lib/api";
import { computeSummary, fullLoadTest, kvaTotal, phaseLabels, phaseOptions, voltageRules } from "@/lib/calc/loadBalancing";
import { useDraft } from "@/lib/useDraft";
import { cn, csvCell, downloadBlob, fmtNum, num, refNumber, str, todayISO } from "@/lib/utils";
import type { CircuitType, LoadBalancingRecord, LoadItem } from "@/types";
import { EditorHeader, Metric, Section } from "../documents/EditorChrome";

const NUM_FIELDS = ["mcb", "mainVoltage", "vLl", "vLn", "vPh", "vL1l2", "vL1l3", "vL2l3", "vL1n", "vL2n", "vL3n", "nameplateKw",
  "measVan", "measVbn", "measVcn", "measIa", "measIb", "measIc", "pfA", "pfB", "pfC"] as const;
const TEXT_FIELDS = ["fileName", "refId", "branchCode", "company", "location", "panel", "wires", "testDate", "testTime",
  "conductedBy", "witnessBy", "certifiedBy", "witnessTenant", "remarks"] as const;
type NumField = (typeof NUM_FIELDS)[number];
type TextField = (typeof TEXT_FIELDS)[number];
export type LBForm = Record<NumField | TextField, string> & { circuitType: CircuitType; loads: LoadItem[] };

export const emptyLB = (): LBForm => ({
  ...(Object.fromEntries([...NUM_FIELDS, ...TEXT_FIELDS].map((k) => [k, ""])) as Record<NumField | TextField, string>),
  circuitType: "three_wye", testDate: todayISO(), loads: [],
});

function fromRecord(r: LoadBalancingRecord): LBForm {
  const f = emptyLB();
  for (const k of [...NUM_FIELDS, ...TEXT_FIELDS]) f[k] = str((r as unknown as Record<string, unknown>)[k]);
  f.testTime = f.testTime.slice(0, 5);
  f.circuitType = r.circuitType ?? "three_wye";
  f.loads = r.loads ?? [];
  return f;
}

export function toPayload(f: LBForm) {
  const out: Record<string, unknown> = { circuitType: f.circuitType, loads: f.loads };
  for (const k of TEXT_FIELDS) out[k] = f[k].trim();
  for (const k of NUM_FIELDS) out[k] = num(f[k]);
  if (out.mcb !== null) out.mcb = Math.round(out.mcb as number);
  return out;
}

function PhaseBars({ labels, values }: { labels: [string, string, string]; values: [number, number, number] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-44 items-end justify-around gap-4 rounded-2xl border border-line bg-[linear-gradient(var(--app-border)_1px,transparent_1px)] bg-[length:100%_25%] px-4 pt-4">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
          <span className="text-xs font-bold tabular-nums text-ink">{v.toFixed(2)} A</span>
          <motion.div className="w-full max-w-[56px] rounded-t-lg bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_20px_-4px_rgba(245,158,11,.6)]"
            initial={{ height: 0 }} animate={{ height: `${Math.max(2, (v / max) * 78)}%` }} transition={{ type: "spring", stiffness: 140, damping: 18 }} />
          <span className="pb-2 text-xs font-semibold text-muted">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function LoadBalancingEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { prompt, confirm } = useDialogs();
  const [form, setForm, clearDraft] = useDraft<LBForm>(isNew ? "load-balancing" : null, emptyLB);
  const [tab, setTab] = useState<"balance" | "fulltest">("balance");
  const [loadName, setLoadName] = useState("");
  const [loadValue, setLoadValue] = useState("");
  const [loadPhase, setLoadPhase] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const existing = useQuery({ queryKey: ["/load-balancing", Number(id)], queryFn: () => api.get<LoadBalancingRecord>(`/load-balancing/${id}`), enabled: !isNew });
  useEffect(() => { if (existing.data) setForm(fromRecord(existing.data)); }, [existing.data, setForm]);
  useEffect(() => { if (isNew && !form.conductedBy && user?.fullName) setForm((f) => ({ ...f, conductedBy: user.fullName ?? "" })); }, [isNew, user]); // eslint-disable-line

  const ct = form.circuitType;
  const phases = phaseOptions(ct);
  useEffect(() => { if (!phases.includes(loadPhase)) setLoadPhase(phases[0]); }, [ct]); // eslint-disable-line
  const rules = voltageRules(ct);
  const summary = useMemo(() => computeSummary(ct, form.loads), [ct, form.loads]);
  const kva = kvaTotal(ct, form.loads, {
    vLl: num(form.vLl), vLn: num(form.vLn), vPh: num(form.vPh), vL1l2: num(form.vL1l2), vL1l3: num(form.vL1l3),
    vL2l3: num(form.vL2l3), vL1n: num(form.vL1n), vL2n: num(form.vL2n), vL3n: num(form.vL3n),
  });
  const flt = fullLoadTest(ct, {
    nameplateKw: num(form.nameplateKw), van: num(form.measVan), vbn: num(form.measVbn), vcn: num(form.measVcn),
    ia: num(form.measIa), ib: num(form.measIb), ic: num(form.measIc), pfA: num(form.pfA), pfB: num(form.pfB), pfC: num(form.pfC),
  });
  const imbTone = summary.imbalancePct < 10 ? "ok" : summary.imbalancePct < 20 ? "warn" : "danger";

  const set = (k: keyof LBForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setCircuit = (v: CircuitType) => setForm((f) => {
    const r = voltageRules(v);
    return { ...f, circuitType: v, vLl: r.vLl ? f.vLl : "", vLn: r.vLn ? f.vLn : "", vPh: r.vPh ? f.vPh : "",
      ...(r.perLineLL ? {} : { vL1l2: "", vL1l3: "", vL2l3: "" }), ...(r.perLineLN ? {} : { vL1n: "", vL2n: "", vL3n: "" }) };
  });

  const addLoad = () => {
    const value = parseFloat(loadValue);
    if (!loadName.trim() || !(value > 0)) return toast.error("Enter a load name and a positive current (A).");
    setForm((f) => ({ ...f, loads: [{ name: loadName.trim(), value, phase: loadPhase }, ...f.loads] }));
    setLoadName("");
    setLoadValue("");
  };
  const applySuggestion = () => {
    const s = summary.suggestions[0];
    if (!s) return;
    setForm((f) => {
      const idx = f.loads.findIndex((l) => l.name === s.name && l.value === s.value && l.phase === s.from);
      if (idx < 0) return f;
      const loads = [...f.loads];
      loads[idx] = { ...loads[idx], phase: s.to };
      return { ...f, loads };
    });
    toast.success(`Moved ${s.name} to ${s.to}`);
  };

  const exportCsv = () => {
    const head = [`# Company: ${form.company}`, `# Location: ${form.location}`, `# Panel: ${form.panel}`, `# Branch: ${form.branchCode}`, ""];
    const rows = ["name,value,phase", ...form.loads.map((l) => [csvCell(l.name), l.value, l.phase].join(","))];
    downloadBlob(head.join("\n") + rows.join("\n"), "loads.csv", "text/csv");
  };
  const importCsv = async (file: File) => {
    const lines = (await file.text()).replace(/\r/g, "").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
    if (/^name\s*,/i.test(lines[0] ?? "")) lines.shift();
    const imported: LoadItem[] = [];
    for (const line of lines) {
      const m = line.match(/^("(?:[^"]|"")*"|[^,]*),([^,]*),(.*)$/);
      if (!m) continue;
      const value = parseFloat(m[2]);
      if (Number.isFinite(value)) imported.push({ name: m[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim(), value, phase: m[3].trim() });
    }
    if (!imported.length) return toast.error("No loads found in that CSV.");
    setForm((f) => ({ ...f, loads: [...imported, ...f.loads] }));
    toast.success(`Imported ${imported.length} load(s)`);
  };

  const save = useMutation({
    mutationFn: async (asNew: boolean) => {
      let fileName = form.fileName;
      if (!fileName || asNew) {
        const name = await prompt({ title: "Save load balancing record", label: "File name", defaultValue: fileName || `LB_${todayISO()}`, confirmLabel: "Save" });
        if (!name) throw new Error("cancelled");
        fileName = name.trim();
      }
      const payload = { ...toPayload({ ...form, fileName }), refId: form.refId || refNumber("LB") };
      return isNew || asNew ? api.post<LoadBalancingRecord>("/load-balancing", payload) : api.put<LoadBalancingRecord>(`/load-balancing/${id}`, payload);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["/load-balancing"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Saved "${rec.fileName}"`);
      if (isNew) { clearDraft(); navigate(`/load-balancing/${rec.id}`, { replace: true }); }
      setForm(fromRecord(rec));
    },
    onError: (e) => { if ((e as Error).message !== "cancelled") toast.error(errorMessage(e)); },
  });

  const print = () => navigate(`/print/load-balancing/${isNew ? "draft" : id}`, { state: { draft: { ...toPayload(form), refId: form.refId || refNumber("LB") } } });

  if (!isNew && existing.isLoading) return <PageLoader />;
  const [la, lb, lc] = phaseLabels(ct);

  return (
    <div>
      <EditorHeader back="/load-balancing" backLabel="Back to load balancing records" icon={<Gauge className="h-5 w-5" />}
        title={isNew ? "New load balancing test" : form.fileName || "Load balancing"}
        subtitle={form.refId || "Load balancing & full load test"}
        badge={isNew ? <Badge tone="info">Draft autosaved</Badge> : undefined}
        actions={<>
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={async () => {
            if (await confirm({ title: "Clear the form?", message: "All fields and loads will be reset.", confirmLabel: "Clear", danger: true })) setForm(emptyLB());
          }}>Clear</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
          {!isNew && <Button variant="secondary" onClick={() => save.mutate(true)}>Save as new</Button>}
          <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(false)}>{isNew ? "Save record" : "Save changes"}</Button>
        </>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Site & panel" icon={<Cable className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Company" className="lg:col-span-2"><Input value={form.company} onChange={set("company")} placeholder="Company name" /></Field>
              <Field label="Branch code"><Input value={form.branchCode} onChange={set("branchCode")} placeholder="Code" /></Field>
              <Field label="Location" className="lg:col-span-2"><Input value={form.location} onChange={set("location")} placeholder="Location" /></Field>
              <Field label="Panel board"><Input value={form.panel} onChange={set("panel")} placeholder="Panel board name" /></Field>
              <Field label="Date"><Input type="date" value={form.testDate} onChange={set("testDate")} /></Field>
              <Field label="Time"><Input type="time" value={form.testTime} onChange={set("testTime")} /></Field>
              <Field label="MCB capacity (A)"><Input type="number" step="1" value={form.mcb} onChange={set("mcb")} /></Field>
              <Field label="Main voltage (V)"><Input type="number" step="0.1" value={form.mainVoltage} onChange={set("mainVoltage")} /></Field>
              <Field label="Size & type of wire" className="lg:col-span-2"><Input value={form.wires} onChange={set("wires")} placeholder="e.g. 3x2.5mm² Cu" /></Field>
            </div>
          </Section>

          <Section title="Power system configuration" icon={<Zap className="h-4 w-4" />} delay={0.05}>
            <Field label="Configuration">
              <Select value={ct} onChange={(e) => setCircuit(e.target.value as CircuitType)}>
                {CIRCUIT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="V (L-L)"><Input type="number" step="0.1" disabled={!rules.vLl} value={form.vLl} onChange={set("vLl")} /></Field>
              <Field label="V (L-N)"><Input type="number" step="0.1" disabled={!rules.vLn} value={form.vLn} onChange={set("vLn")} /></Field>
              <Field label="V (Ph)"><Input type="number" step="0.1" disabled={!rules.vPh} value={form.vPh} onChange={set("vPh")} /></Field>
            </div>
            <AnimatePresence initial={false}>
              {rules.perLineLL && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Field label="V L1-L2" hint="Per-line (optional)"><Input type="number" step="0.1" value={form.vL1l2} onChange={set("vL1l2")} /></Field>
                    <Field label="V L1-L3"><Input type="number" step="0.1" value={form.vL1l3} onChange={set("vL1l3")} /></Field>
                    <Field label="V L2-L3"><Input type="number" step="0.1" value={form.vL2l3} onChange={set("vL2l3")} /></Field>
                  </div>
                </motion.div>
              )}
              {rules.perLineLN && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Field label="V L1-N"><Input type="number" step="0.1" value={form.vL1n} onChange={set("vL1n")} /></Field>
                    <Field label="V L2-N"><Input type="number" step="0.1" value={form.vL2n} onChange={set("vL2n")} /></Field>
                    <Field label="V L3-N"><Input type="number" step="0.1" value={form.vL3n} onChange={set("vL3n")} /></Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          <div>
            <div className="mb-3"><Segmented layoutId="lb-tab" value={tab} onChange={setTab} options={[{ value: "balance", label: "Load balancing" }, { value: "fulltest", label: "Full load test" }]} /></div>
            <AnimatePresence mode="wait">
              {tab === "balance" ? (
                <motion.div key="b" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}>
                  <Section title="Circuit loads" icon={<Lightbulb className="h-4 w-4" />}
                    actions={<div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={<FileUp className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>Import CSV</Button>
                      <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} disabled={!form.loads.length} onClick={exportCsv}>Export</Button>
                      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
                    </div>}>
                    <form className="grid gap-3 sm:grid-cols-[1fr_140px_120px_auto]" onSubmit={(e) => { e.preventDefault(); addLoad(); }}>
                      <Input value={loadName} onChange={(e) => setLoadName(e.target.value)} placeholder="Circuit no. / description, e.g. #1" />
                      <Input type="number" step="0.01" value={loadValue} onChange={(e) => setLoadValue(e.target.value)} placeholder="Amps (A)" />
                      <Select value={loadPhase} onChange={(e) => { setLoadPhase(e.target.value); if (ct === "three_wye" && e.target.value === "N") setLoadName("Neutral Current"); }}>
                        {phases.map((p) => <option key={p}>{p}</option>)}
                      </Select>
                      <Button type="submit" icon={<Plus className="h-4 w-4" />}>Add</Button>
                    </form>
                    <div className="mt-4 overflow-hidden rounded-xl border border-line">
                      <div className="grid grid-cols-[1fr_110px_80px_44px] bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                        <span>Load</span><span className="text-right">Amps</span><span className="text-center">Phase</span><span />
                      </div>
                      {form.loads.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted">No loads yet — add each branch circuit's measured current.</div>
                      ) : (
                        <ul className="scrollbar-thin max-h-[360px] overflow-y-auto">
                          <AnimatePresence initial={false}>
                            {form.loads.map((l, i) => (
                              <motion.li key={`${l.name}-${l.phase}-${i}`} layout initial={{ opacity: 0, backgroundColor: "var(--app-accent-soft)" }}
                                animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4 }}
                                className="grid grid-cols-[1fr_110px_80px_44px] items-center border-t border-line px-4 py-2 text-sm">
                                <span className="truncate text-ink">{l.name}</span>
                                <span className="text-right font-semibold tabular-nums text-ink">{l.value.toFixed(2)}</span>
                                <span className="text-center"><Badge tone="info">{l.phase}</Badge></span>
                                <button className="justify-self-end rounded p-1 text-faint hover:text-danger" aria-label={`Remove ${l.name}`}
                                  onClick={() => setForm((f) => ({ ...f, loads: f.loads.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                        </ul>
                      )}
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted">
                      <span>{form.loads.length} load{form.loads.length === 1 ? "" : "s"}</span>
                      {form.loads.length > 0 && <button className="font-medium hover:text-danger" onClick={async () => {
                        if (await confirm({ title: "Remove all loads?", confirmLabel: "Remove all", danger: true })) setForm((f) => ({ ...f, loads: [] }));
                      }}>Clear all loads</button>}
                    </div>
                  </Section>
                </motion.div>
              ) : (
                <motion.div key="f" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                  <Section title="Full load test" icon={<Zap className="h-4 w-4" />}>
                    <Field label="Nameplate full load power (kW)"><Input type="number" step="0.1" value={form.nameplateKw} onChange={set("nameplateKw")} /></Field>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      {(["measVan", "measVbn", "measVcn"] as const).map((k, i) => <Field key={k} label={`V ${["AN", "BN", "CN"][i]}`}><Input type="number" step="0.1" value={form[k]} onChange={set(k)} /></Field>)}
                      {(["measIa", "measIb", "measIc"] as const).map((k, i) => <Field key={k} label={`I ${["A", "B", "C"][i]} (A)`}><Input type="number" step="0.1" value={form[k]} onChange={set(k)} /></Field>)}
                      {(["pfA", "pfB", "pfC"] as const).map((k, i) => <Field key={k} label={`PF ${["A", "B", "C"][i]}`} hint="0 – 1, blank = 1"><Input type="number" step="0.01" min="0" max="1" value={form[k]} onChange={set(k)} /></Field>)}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-5">
                      <Metric label="P A" value={`${flt.pa.toFixed(3)} kW`} />
                      <Metric label="P B" value={`${flt.pb.toFixed(3)} kW`} />
                      <Metric label="P C" value={`${flt.pc.toFixed(3)} kW`} />
                      <Metric label="Total" value={`${flt.total.toFixed(3)} kW`} />
                      <Metric label="% of nameplate" value={`${flt.pct.toFixed(1)} %`} tone={flt.pct > 100 ? "danger" : flt.pct > 80 ? "warn" : flt.pct > 0 ? "ok" : undefined} />
                    </div>
                  </Section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Section title="Remarks & signatories" icon={<PenLine className="h-4 w-4" />}>
            <Field label="Remarks"><Textarea value={form.remarks} onChange={set("remarks")} placeholder="Findings, observations…" /></Field>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Conducted by" hint="Electrician / contractor"><Input value={form.conductedBy} onChange={set("conductedBy")} /></Field>
              <Field label="Witnessed & verified by" hint="Mall representative / operations in-charge"><Input value={form.witnessBy} onChange={set("witnessBy")} /></Field>
              <Field label="Certified by" hint="RME / REE / PEE"><Input value={form.certifiedBy} onChange={set("certifiedBy")} /></Field>
              <Field label="Witnessed by (tenant)" hint="Tenant representative"><Input value={form.witnessTenant} onChange={set("witnessTenant")} /></Field>
            </div>
          </Section>
        </div>

        {/* Live summary */}
        <div className="space-y-6 xl:sticky xl:top-36 xl:self-start">
          <Section title="Live summary" icon={<Gauge className="h-4 w-4" />} delay={0.1}>
            <PhaseBars labels={[la, lb, lc]} values={[summary.a, summary.b, summary.c]} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Total load" value={`${summary.total.toFixed(2)} A`} />
              <Metric label="Average / phase" value={`${summary.average.toFixed(2)} A`} />
              <Metric label="Max imbalance" value={`${summary.imbalancePct.toFixed(1)} %`} tone={summary.total ? imbTone : undefined} />
              <Metric label="kVA total" value={kva ? fmtNum(kva, 3) : "—"} />
            </div>
            {ct === "three_wye" && summary.totals.N > 0 && <p className="mt-3 text-xs text-muted">Measured neutral: <b className="text-ink">{summary.totals.N.toFixed(2)} A</b> (included in total, as on the printed form)</p>}
          </Section>
          <Section title="Balancing suggestions" icon={<Sparkles className="h-4 w-4" />} delay={0.15}
            actions={summary.suggestions.length > 0 && <Button size="sm" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={applySuggestion}>Apply first</Button>}>
            {summary.suggestions.length === 0 ? (
              <p className="text-sm text-muted">{form.loads.length ? "No single-load move improves the balance. 👍" : "Add loads to get suggestions."}</p>
            ) : (
              <ol className="space-y-2">
                {summary.suggestions.map((s, i) => (
                  <motion.li key={`${s.name}-${i}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", i === 0 ? "border-accent/40 bg-accent-soft" : "border-line")}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-bold text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-ink">Move <b>{s.name}</b> ({s.value} A)</span>
                    <span className="shrink-0 text-xs font-semibold text-muted">{s.from} → {s.to}</span>
                  </motion.li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
