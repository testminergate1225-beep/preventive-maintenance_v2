import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, Download, FileText, PenLine, Plus, Printer, RotateCcw, Save, Trash2, XCircle, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { ComboSelect, Field, Input, Select } from "@/components/ui/Field";
import { useDialogs } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Surface";
import { IR_TEST_TYPES, MEGGER_CIRCUITS, WIRE_SIZES } from "@/config/options";
import { api, errorMessage } from "@/lib/api";
import { autoRemark, enabledKeys, PASS_THRESHOLD_MOHM } from "@/lib/calc/megger";
import { useDraft } from "@/lib/useDraft";
import { cn, csvCell, downloadBlob, num, refNumber, str, todayISO } from "@/lib/utils";
import { MEGGER_KEYS, type MeggerCircuit, type MeggerRecord, type MeggerRow } from "@/types";
import { ArchivedNotice, useUnarchive } from "../archive/ArchiveDialog";
import { EditorHeader, Locked, Metric, Section } from "../documents/EditorChrome";

export type MeggerForm = {
  fileName: string; company: string; location: string; subject: string; testDate: string; irTestType: string; testVoltage: string;
  referenceNo: string; circuitType: MeggerCircuit; conductedBy: string; witnessedBy: string; verifiedBy: string; rows: MeggerRow[];
};

export const blankRow = (): MeggerRow => ({ panel: "", branch: "", wire: "", remarks: "", ...(Object.fromEntries(MEGGER_KEYS.map((k) => [k, ""])) as Record<(typeof MEGGER_KEYS)[number], string>) });
const emptyForm = (): MeggerForm => ({
  fileName: "", company: "", location: "", subject: "MEGGER TEST RESULT / INSULATION TEST", testDate: todayISO(), irTestType: IR_TEST_TYPES[0],
  testVoltage: "", referenceNo: refNumber("MTR"), circuitType: "3phase-delta", conductedBy: "", witnessedBy: "", verifiedBy: "",
  rows: Array.from({ length: 5 }, blankRow),
});

function fromRecord(r: MeggerRecord): MeggerForm {
  return {
    fileName: str(r.fileName), company: str(r.company), location: str(r.location), subject: str(r.subject), testDate: str(r.testDate),
    irTestType: str(r.irTestType), testVoltage: str(r.testVoltage), referenceNo: str(r.referenceNo), circuitType: r.circuitType ?? "3phase-delta",
    conductedBy: str(r.conductedBy), witnessedBy: str(r.witnessedBy), verifiedBy: str(r.verifiedBy),
    rows: (r.rows ?? []).map((row) => ({ ...blankRow(), ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, str(v)])) })),
  };
}

export function meggerPayload(f: MeggerForm) {
  const keys = enabledKeys(f.circuitType);
  const rows = f.rows
    .filter((r) => Object.values(r).some((v) => String(v).trim() !== ""))
    .map((r) => ({ ...r, ...Object.fromEntries(MEGGER_KEYS.map((k) => [k, keys.includes(k) ? num(r[k]) : null])) }));
  return { ...f, rows };
}

export function MeggerEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { prompt, confirm } = useDialogs();
  const [form, setForm, clearDraft] = useDraft<MeggerForm>(isNew ? "megger" : null, emptyForm);
  const existing = useQuery({ queryKey: ["/megger-tests", Number(id)], queryFn: () => api.get<MeggerRecord>(`/megger-tests/${id}`), enabled: !isNew });
  useEffect(() => { if (existing.data) setForm(fromRecord(existing.data)); }, [existing.data, setForm]);
  useEffect(() => { if (isNew && !form.conductedBy && user?.fullName) setForm((f) => ({ ...f, conductedBy: user.fullName ?? "" })); }, [isNew, user]); // eslint-disable-line

  const enabled = enabledKeys(form.circuitType);
  const set = (k: keyof MeggerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (i: number, patch: Partial<MeggerRow>) => setForm((f) => {
    const rows = [...f.rows];
    const next = { ...rows[i], ...patch };
    // Keep the auto remark in sync unless the user typed something custom.
    if (MEGGER_KEYS.some((k) => k in patch) && ["", "Passed", "Failed"].includes(rows[i].remarks)) next.remarks = autoRemark(next, f.circuitType);
    rows[i] = next;
    return { ...f, rows };
  });
  const setCircuit = (c: MeggerCircuit) => setForm((f) => {
    const keep = enabledKeys(c);
    const rows = f.rows.map((r) => {
      const cleared = { ...r, ...Object.fromEntries(MEGGER_KEYS.filter((k) => !keep.includes(k)).map((k) => [k, ""])) } as MeggerRow;
      return ["", "Passed", "Failed"].includes(r.remarks) ? { ...cleared, remarks: autoRemark(cleared, c) } : cleared;
    });
    return { ...f, circuitType: c, rows };
  });

  const graded = form.rows.filter((r) => r.remarks === "Passed" || r.remarks === "Failed");
  const failed = form.rows.filter((r) => r.remarks === "Failed").length;

  const save = useMutation({
    mutationFn: async (asNew: boolean) => {
      let fileName = form.fileName;
      if (!fileName || asNew) {
        const name = await prompt({ title: "Save megger test", label: "File name", defaultValue: fileName || form.referenceNo, confirmLabel: "Save" });
        if (!name) throw new Error("cancelled");
        fileName = name.trim();
      }
      const payload = meggerPayload({ ...form, fileName });
      return isNew || asNew ? api.post<MeggerRecord>("/megger-tests", payload) : api.put<MeggerRecord>(`/megger-tests/${id}`, payload);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["/megger-tests"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Saved "${rec.fileName}"`);
      if (isNew) { clearDraft(); navigate(`/megger/${rec.id}`, { replace: true }); }
      setForm(fromRecord(rec));
    },
    onError: (e) => { if ((e as Error).message !== "cancelled") toast.error(errorMessage(e)); },
  });

  const downloadCsv = () => {
    const hdr = ["Date", "Company", "Location", "Panel", "Branch", ...MEGGER_KEYS, "Wire", "Remarks", "ConductedBy", "WitnessedBy", "VerifiedBy"];
    const lines = meggerPayload(form).rows.map((r) => [form.testDate, form.company, form.location, r.panel, r.branch, ...MEGGER_KEYS.map((k) => r[k] ?? ""), r.wire, r.remarks,
      form.conductedBy, form.witnessedBy, form.verifiedBy].map(csvCell).join(","));
    downloadBlob("﻿" + [hdr.map(csvCell).join(","), ...lines].join("\r\n"), `${form.fileName || form.referenceNo || "megger"}.csv`, "text/csv");
  };

  const rec = existing.data;
  const archived = !isNew && !!rec?.archivedAt;
  const unarchive = useUnarchive("/megger-tests", Number(id));
  const print = () => navigate(`/print/megger/${isNew ? "draft" : id}`, { state: { draft: meggerPayload(form) } });

  if (!isNew && existing.isLoading) return <PageLoader />;

  return (
    <div>
      <EditorHeader back="/megger" backLabel="Back to megger tests" icon={<Zap className="h-5 w-5" />}
        title={isNew ? "New insulation resistance test" : form.fileName || "Megger test"} subtitle={form.referenceNo}
        badge={isNew ? <Badge tone="info">Draft autosaved</Badge> : archived ? <Badge tone="neutral"><Archive className="h-3 w-3" /> Archived</Badge> : undefined}
        actions={archived ? <>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadCsv}>CSV</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
          {isAdmin && <Button variant="secondary" onClick={unarchive}>Unarchive</Button>}
        </> : <>
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: "Clear the form?", confirmLabel: "Clear", danger: true })) setForm(emptyForm()); }}>Clear</Button>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadCsv}>CSV</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
          {!isNew && <Button variant="secondary" onClick={() => save.mutate(true)}>Save as new</Button>}
          <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(false)}>{isNew ? "Save test" : "Save changes"}</Button>
        </>} />

      {archived && rec?.archivedAt && (
        <ArchivedNotice archivedAt={rec.archivedAt} archivedByName={rec.archivedByName} archiveReason={rec.archiveReason} canUnarchive={isAdmin} />
      )}

      <Locked locked={archived} className="space-y-6">
        <Section title="Test details" icon={<FileText className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Company"><Input value={form.company} onChange={set("company")} /></Field>
            <Field label="Location"><Input value={form.location} onChange={set("location")} /></Field>
            <Field label="Date"><Input type="date" value={form.testDate} onChange={set("testDate")} /></Field>
            <Field label="Reference no."><Input value={form.referenceNo} onChange={set("referenceNo")} /></Field>
            <Field label="Subject" className="sm:col-span-2"><Input value={form.subject} onChange={set("subject")} /></Field>
            <Field label="IR test type"><Select value={form.irTestType} onChange={set("irTestType")}>{IR_TEST_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Test voltage"><Input value={form.testVoltage} onChange={set("testVoltage")} placeholder="e.g. 500V" /></Field>
            <Field label="Circuit type" className="sm:col-span-2">
              <Select value={form.circuitType} onChange={(e) => setCircuit(e.target.value as MeggerCircuit)}>{MEGGER_CIRCUITS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
            </Field>
          </div>
        </Section>

        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Rows graded" value={graded.length} />
          <Metric label="Passed" value={graded.length - failed} tone={graded.length ? "ok" : undefined} />
          <Metric label="Failed" value={failed} tone={failed ? "danger" : undefined} />
          <Metric label="Pass threshold" value={`≥ ${PASS_THRESHOLD_MOHM} MΩ`} />
        </div>

        <Section title="Panel board / branch circuit readings (MΩ)" icon={<Zap className="h-4 w-4" />}
          actions={<div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm((f) => ({ ...f, rows: [...f.rows, blankRow()] }))}>Add row</Button>
          </div>}>
          <div className="scrollbar-thin -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-faint [&>th]:border-b [&>th]:border-line [&>th]:px-1.5 [&>th]:pb-2 [&>th]:text-left">
                  <th className="w-[120px]">Panel</th><th className="w-[90px]">Branch ckt #</th>
                  {MEGGER_KEYS.map((k) => <th key={k} className={cn("w-[72px] text-center", !enabled.includes(k) && "opacity-35")}>{k}</th>)}
                  <th className="w-[170px]">Wire</th><th className="w-[110px]">Remarks</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {form.rows.map((r, i) => (
                    <motion.tr key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} className="[&>td]:px-1 [&>td]:py-1.5 [&>td]:align-top">
                      <td><Input className="h-9" value={r.panel} onChange={(e) => setRow(i, { panel: e.target.value })} /></td>
                      <td><Input className="h-9" value={r.branch} onChange={(e) => setRow(i, { branch: e.target.value })} /></td>
                      {MEGGER_KEYS.map((k) => {
                        const v = r[k];
                        const low = v !== "" && Number(v) < PASS_THRESHOLD_MOHM;
                        return (
                          <td key={k}>
                            <Input type="number" step="0.01" className={cn("h-9 px-2 text-center tabular-nums", low && "border-danger bg-danger-soft text-danger")}
                              disabled={!enabled.includes(k)} value={v} onChange={(e) => setRow(i, { [k]: e.target.value } as Partial<MeggerRow>)} aria-label={`${k} row ${i + 1}`} />
                          </td>
                        );
                      })}
                      <td><ComboSelect value={r.wire} onChange={(wire) => setRow(i, { wire })} options={WIRE_SIZES} placeholder="--Select--" customLabel="Custom…" /></td>
                      <td>
                        <div className="relative">
                          <Input className={cn("h-9 pr-7 font-semibold", r.remarks === "Passed" && "text-ok", r.remarks === "Failed" && "text-danger")} value={r.remarks} onChange={(e) => setRow(i, { remarks: e.target.value })} />
                          <AnimatePresence>
                            {(r.remarks === "Passed" || r.remarks === "Failed") && (
                              <motion.span key={r.remarks} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-2 top-1/2 -translate-y-1/2">
                                {r.remarks === "Passed" ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-danger" />}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                      <td><button className="mt-2 rounded p-1 text-faint hover:text-danger" aria-label={`Remove row ${i + 1}`} onClick={() => setForm((f) => ({ ...f, rows: f.rows.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button></td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Remarks are set automatically: any applicable reading below {PASS_THRESHOLD_MOHM} MΩ marks the circuit <b className="text-danger">Failed</b>. Type over it to add a custom remark.</p>
        </Section>

        <Section title="Signatories" icon={<PenLine className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Conducted by" hint="Electrician / technician"><Input value={form.conductedBy} onChange={set("conductedBy")} /></Field>
            <Field label="Witnessed by" hint="Representative"><Input value={form.witnessedBy} onChange={set("witnessedBy")} /></Field>
            <Field label="Verified by" hint="Electrical engineer"><Input value={form.verifiedBy} onChange={set("verifiedBy")} /></Field>
          </div>
        </Section>
      </Locked>
    </div>
  );
}
