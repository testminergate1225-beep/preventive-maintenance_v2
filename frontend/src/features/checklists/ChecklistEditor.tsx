import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ClipboardCheck, FileText, Package, Minus, PenLine, Plus, Printer, RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { useDialogs } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Surface";
import { BRANCHES, CHECKLIST_TEMPLATE } from "@/config/options";
import { api, errorMessage } from "@/lib/api";
import { useDraft } from "@/lib/useDraft";
import { cn, refNumber, str, todayISO } from "@/lib/utils";
import type { Bom, ChecklistCategory, ChecklistRecord, ItemStatus } from "@/types";
import { ArchivedNotice, useUnarchive } from "../archive/ArchiveDialog";
import { BomDetailsFields, BomItemsEditor } from "../bom/BomItemsEditor";
import { bomPayload, bomProblems, emptyBomForm, notOkFindings, type BomForm } from "../bom/bomForm";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import { EditorHeader, Locked, Section } from "../documents/EditorChrome";

export type ChecklistForm = {
  branchName: string; branchCode: string; location: string; checklistDate: string; conductedBy: string; refNumber: string;
  sigConducted: string; sigWitnessed: string; sigStoreManager: string; sigStoreRep: string; overallRecommendations: string;
  categories: ChecklistCategory[];
};

const templateCategories = (): ChecklistCategory[] =>
  CHECKLIST_TEMPLATE.map((c) => ({ category: c.category, subtitle: c.subtitle, items: c.items.map((desc) => ({ desc, status: "", remarks: "", recommendations: "" })) }));

const emptyForm = (): ChecklistForm => ({
  branchName: "", branchCode: "", location: "", checklistDate: todayISO(), conductedBy: "", refNumber: refNumber("PM"),
  sigConducted: "", sigWitnessed: "", sigStoreManager: "", sigStoreRep: "", overallRecommendations: "", categories: templateCategories(),
});

function fromRecord(r: ChecklistRecord): ChecklistForm {
  return {
    branchName: str(r.branchName), branchCode: str(r.branchCode), location: str(r.location), checklistDate: str(r.checklistDate),
    conductedBy: str(r.conductedBy), refNumber: str(r.refNumber), sigConducted: str(r.sigConducted), sigWitnessed: str(r.sigWitnessed),
    sigStoreManager: str(r.sigStoreManager), sigStoreRep: str(r.sigStoreRep), overallRecommendations: str(r.overallRecommendations),
    categories: (r.categories?.length ? r.categories : templateCategories()).map((c) => ({
      category: c.category, subtitle: str(c.subtitle),
      items: (c.items ?? []).map((i) => ({ desc: str(i.desc), status: (i.status ?? "") as ItemStatus, remarks: str(i.remarks), recommendations: str(i.recommendations) })),
    })),
  };
}

const STATUS_OPTS: Array<{ value: ItemStatus; label: string; cls: string }> = [
  { value: "ok", label: "OK", cls: "bg-ok text-white" },
  { value: "not_ok", label: "NOT OK", cls: "bg-danger text-white" },
  { value: "na", label: "N/A", cls: "bg-faint text-white" },
];

function StatusPicker({ value, onChange, name }: { value: ItemStatus; onChange: (v: ItemStatus) => void; name: string }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5" role="radiogroup" aria-label={name}>
      {STATUS_OPTS.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(active ? "" : o.value)}
            className={cn("relative rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors", active ? "text-white" : "text-muted hover:text-ink")}>
            {active && <motion.span layoutId={`st-${name}`} className={cn("absolute inset-0 rounded-md", o.cls)} transition={{ type: "spring", stiffness: 500, damping: 32 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--app-border)" strokeWidth="7" />
      <motion.circle cx="32" cy="32" r={r} fill="none" stroke="var(--app-ok)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ type: "spring", stiffness: 80, damping: 18 }} />
    </svg>
  );
}

export function ChecklistEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { confirm } = useDialogs();
  const [form, setForm, clearDraft] = useDraft<ChecklistForm>(isNew ? "checklist" : null, emptyForm);
  // Bill of Materials raised alongside a new checklist (kept as its own draft on this device).
  const [bomDraft, setBomDraft, clearBomDraft] = useDraft<BomForm & { enabled: boolean }>(
    isNew ? "checklist-bom" : null, () => ({ enabled: true, ...emptyBomForm(user?.fullName ?? user?.email ?? "") }));
  const existing = useQuery({ queryKey: ["/checklists", Number(id)], queryFn: () => api.get<ChecklistRecord>(`/checklists/${id}`), enabled: !isNew });
  useEffect(() => { if (existing.data) setForm(fromRecord(existing.data)); }, [existing.data, setForm]);
  useEffect(() => { if (isNew && !form.conductedBy && user) setForm((f) => ({ ...f, conductedBy: user.fullName ?? user.email })); }, [isNew, user]); // eslint-disable-line

  const set = (k: keyof ChecklistForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (ci: number, ii: number, patch: Partial<ChecklistCategory["items"][number]>) => setForm((f) => ({
    ...f, categories: f.categories.map((c, x) => x !== ci ? c : { ...c, items: c.items.map((it, y) => (y === ii ? { ...it, ...patch } : it)) }),
  }));
  const addItem = (ci: number) => setForm((f) => ({ ...f, categories: f.categories.map((c, x) => x !== ci ? c : { ...c, items: [...c.items, { desc: "", status: "", remarks: "", recommendations: "" }] }) }));
  const removeItem = (ci: number) => setForm((f) => ({ ...f, categories: f.categories.map((c, x) => x !== ci || c.items.length <= 1 ? c : { ...c, items: c.items.slice(0, -1) }) }));

  const stats = useMemo(() => {
    const all = form.categories.flatMap((c) => c.items);
    const count = (s: ItemStatus) => all.filter((i) => i.status === s).length;
    const done = all.filter((i) => i.status).length;
    return { total: all.length, done, ok: count("ok"), notOk: count("not_ok"), na: count("na"), pct: all.length ? Math.round((done / all.length) * 100) : 0 };
  }, [form.categories]);

  const findings = useMemo(() => notOkFindings(form.categories), [form.categories]);
  const withBom = isNew && stats.notOk > 0 && bomDraft.enabled;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.branchName.trim()) throw new Error("Please enter a branch name.");
      if (!form.checklistDate) throw new Error("Please pick a date.");
      if (withBom) {
        const problems = bomProblems(bomDraft);
        if (bomDraft.storeEmail.trim() && !EMAIL.test(bomDraft.storeEmail.trim())) problems.unshift("Enter a valid store e-mail for the Bill of Materials.");
        if (problems.length) throw new Error(problems[0]);
      }
      const rec = isNew ? await api.post<ChecklistRecord>("/checklists", form) : await api.put<ChecklistRecord>(`/checklists/${id}`, form);
      let bom: Bom | null = null;
      let bomError: unknown = null;
      if (withBom) {
        try { bom = await api.post<Bom>(`/checklists/${rec.id}/bom`, bomPayload(bomDraft)); } catch (e) { bomError = e; }
      }
      return { rec, bom, bomError };
    },
    onSuccess: ({ rec, bom, bomError }) => {
      qc.invalidateQueries({ queryKey: ["/checklists"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      if (isNew) { clearDraft(); clearBomDraft(); }
      if (bom) {
        toast.success(`Checklist saved · ${bom.bomNumber} created`, { description: "Review the Bill of Materials, then finalize to e-mail the store." });
        navigate(`/checklists/${rec.id}/bom`, { replace: true });
        return;
      }
      if (bomError) toast.error(`Checklist saved, but the Bill of Materials wasn't created: ${errorMessage(bomError)}`, { description: "Open the checklist and use Create Bill of Materials." });
      else toast.success("Checklist saved");
      if (isNew) navigate(`/checklists/${rec.id}`, { replace: true });
      setForm(fromRecord(rec));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rec = existing.data;
  const archived = !isNew && !!rec?.archivedAt;
  const unarchive = useUnarchive("/checklists", Number(id));
  const print = () => navigate(`/print/checklists/${isNew ? "draft" : id}`, { state: { draft: form } });

  if (!isNew && existing.isLoading) return <PageLoader />;

  return (
    <div>
      <EditorHeader back="/checklists" backLabel="Back to checklists" icon={<ClipboardCheck className="h-5 w-5" />}
        title={isNew ? "New PM checklist" : `${form.branchName || "Checklist"}`} subtitle={form.refNumber}
        badge={isNew ? <Badge tone="info">Draft autosaved</Badge> : archived ? <Badge tone="neutral"><Archive className="h-3 w-3" /> Archived</Badge> : undefined}
        actions={archived ? <>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
          {isAdmin && <Button variant="secondary" onClick={unarchive}>Unarchive</Button>}
        </> : <>
          <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: "Reset the checklist?", confirmLabel: "Reset", danger: true })) setForm(emptyForm()); }}>Reset</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
          <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>{isNew ? "Save checklist" : "Save changes"}</Button>
        </>} />

      {archived && rec?.archivedAt && (
        <ArchivedNotice archivedAt={rec.archivedAt} archivedByName={rec.archivedByName} archiveReason={rec.archiveReason} canUnarchive={isAdmin} />
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Locked locked={archived} className="space-y-6">
          <Section title="Branch information" icon={<FileText className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Branch name" required>
                <Input list="branch-list" value={form.branchName} onChange={set("branchName")} placeholder="Select or type" />
                <datalist id="branch-list">{BRANCHES.map((b) => <option key={b} value={b} />)}</datalist>
              </Field>
              <Field label="Branch code"><Input value={form.branchCode} onChange={set("branchCode")} placeholder="e.g. TW, JA, FH" /></Field>
              <Field label="Location"><Input value={form.location} onChange={set("location")} placeholder="Mall / building" /></Field>
              <Field label="Date" required><Input type="date" value={form.checklistDate} onChange={set("checklistDate")} /></Field>
              <Field label="Conducted by"><Input value={form.conductedBy} onChange={set("conductedBy")} /></Field>
              <Field label="Reference number"><Input value={form.refNumber} readOnly className="bg-sunken" /></Field>
            </div>
          </Section>

          {form.categories.map((cat, ci) => {
            const done = cat.items.filter((i) => i.status).length;
            return (
              <Section key={ci} title={cat.category} delay={Math.min(ci * 0.03, 0.2)}
                actions={<div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted">{done}/{cat.items.length}</span>
                  <Button size="icon" variant="ghost" title="Remove last item" onClick={() => removeItem(ci)} disabled={cat.items.length <= 1}><Minus className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Add item" onClick={() => addItem(ci)}><Plus className="h-4 w-4" /></Button>
                </div>}>
                {cat.subtitle && <p className="-mt-1 mb-3 text-xs text-muted">{cat.subtitle}</p>}
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {cat.items.map((it, ii) => (
                      <motion.div key={ii} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                        className={cn("rounded-xl border p-3 transition-colors",
                          it.status === "ok" ? "border-ok/30 bg-ok-soft/40" : it.status === "not_ok" ? "border-danger/30 bg-danger-soft/40" : "border-line bg-surface")}>
                        <div className="flex flex-wrap items-center gap-3">
                          <Input className="h-9 min-w-[220px] flex-1 font-medium" value={it.desc} onChange={(e) => setItem(ci, ii, { desc: e.target.value })} placeholder="Item description" />
                          <StatusPicker name={`${ci}-${ii}`} value={it.status} onChange={(status) => setItem(ci, ii, { status })} />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Textarea className="min-h-[38px] py-2 text-[13px]" rows={1} value={it.remarks} onChange={(e) => setItem(ci, ii, { remarks: e.target.value })} placeholder="Remarks / work done" />
                          <Textarea className="min-h-[38px] py-2 text-[13px]" rows={1} value={it.recommendations} onChange={(e) => setItem(ci, ii, { recommendations: e.target.value })} placeholder="Recommendations" />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </Section>
            );
          })}

          {/* NOT OK → offer a Bill of Materials (new checklists; existing ones use the BOM page) */}
          <AnimatePresence initial={false}>
            {isNew && stats.notOk > 0 && (
              <motion.div key="bom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <Section title="Bill of Materials" icon={<Package className="h-4 w-4" />}
                  className={cn("ring-2 transition", bomDraft.enabled ? "ring-accent/40" : "ring-transparent")}
                  actions={<Checkbox checked={bomDraft.enabled} onChange={(enabled) => setBomDraft((b) => ({ ...b, enabled }))} label={<span className="text-[13px] font-semibold">Create a BOM</span>} />}>
                  {bomDraft.enabled ? (<>
                    <p className="mb-4 text-sm text-muted">
                      <b className="text-ink">{stats.notOk} item{stats.notOk === 1 ? "" : "s"} marked NOT OK</b> — list the materials needed to fix {stats.notOk === 1 ? "it" : "them"}.
                      The BOM is created as a draft when you save the checklist; you can review it, then finalize to e-mail the store.
                    </p>
                    <BomItemsEditor items={bomDraft.items} findings={findings} onChange={(items) => setBomDraft((b) => ({ ...b, items }))} />
                    <div className="mt-5 border-t border-line pt-4">
                      <BomDetailsFields compact form={bomDraft} onChange={(p) => setBomDraft((b) => ({ ...b, ...p }))} />
                    </div>
                  </>) : (
                    <p className="text-sm text-muted">No Bill of Materials will be created. You can still create one later from the saved checklist.</p>
                  )}
                </Section>
              </motion.div>
            )}
          </AnimatePresence>

          <Section title="Sign-off" icon={<PenLine className="h-4 w-4" />}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Conducted by"><Input value={form.sigConducted} onChange={set("sigConducted")} /></Field>
              <Field label="Witnessed by"><Input value={form.sigWitnessed} onChange={set("sigWitnessed")} /></Field>
              <Field label="Store manager"><Input value={form.sigStoreManager} onChange={set("sigStoreManager")} /></Field>
              <Field label="Store representative"><Input value={form.sigStoreRep} onChange={set("sigStoreRep")} /></Field>
            </div>
            <Field label="Overall recommendations" className="mt-4"><Textarea value={form.overallRecommendations} onChange={set("overallRecommendations")} /></Field>
          </Section>
        </Locked>

        <div className="xl:sticky xl:top-36 xl:self-start">
          <Section title="Progress" icon={<ClipboardCheck className="h-4 w-4" />}>
            <div className="flex items-center gap-4">
              <div className="relative"><ProgressRing pct={stats.pct} /><span className="absolute inset-0 grid place-items-center text-sm font-bold text-ink">{stats.pct}%</span></div>
              <div className="text-sm text-muted"><b className="text-ink">{stats.done}</b> of {stats.total} items checked</div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[["OK", stats.ok, "bg-ok"], ["Not OK", stats.notOk, "bg-danger"], ["N/A", stats.na, "bg-faint"]].map(([l, v, c]) => (
                <div key={l as string} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted"><span className={cn("h-2.5 w-2.5 rounded-full", c as string)} />{l}</span>
                  <motion.span key={v as number} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="font-semibold tabular-nums text-ink">{v}</motion.span>
                </div>
              ))}
            </div>
            {stats.notOk > 0 && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{stats.notOk} item(s) need attention — add recommendations.</p>}
          </Section>

          {/* Bill of Materials card */}
          {!isNew && (rec?.bomId || stats.notOk > 0) && (
            <Section title="Bill of Materials" icon={<Package className="h-4 w-4" />} className="mt-6">
              {rec?.bomId ? (<>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted">Status</span>
                  {rec.bomStatus === "final" ? <Badge tone="ok" dot>Finalized</Badge> : <Badge tone="warn" dot>Draft</Badge>}
                </div>
                <Button className="mt-4 w-full" icon={<Package className="h-4 w-4" />} onClick={() => navigate(`/checklists/${id}/bom`)}>Open Bill of Materials</Button>
              </>) : (<>
                <p className="text-sm text-muted">{stats.notOk} item(s) are NOT OK. Raise a Bill of Materials for the replacement parts.</p>
                {!archived && <Button className="mt-4 w-full" icon={<Package className="h-4 w-4" />} onClick={() => navigate(`/checklists/${id}/bom`)}>Create Bill of Materials</Button>}
              </>)}
            </Section>
          )}
          {isNew && stats.notOk > 0 && bomDraft.enabled && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-xs text-ink">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
              A Bill of Materials with {bomDraft.items.filter((i) => i.name.trim()).length} line(s) will be created when you save.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
