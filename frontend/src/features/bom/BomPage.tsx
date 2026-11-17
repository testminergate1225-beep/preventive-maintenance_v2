import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Copy, Download, FileText, Mail, MailCheck, Package, Printer, RefreshCw, Save, Send, Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoader } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal, useDialogs } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Surface";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import type { Bom, BomSendResult, ChecklistRecord } from "@/types";
import { EditorHeader, Locked, Section } from "../documents/EditorChrome";
import { BomDetailsFields, BomItemsEditor } from "./BomItemsEditor";
import { bomPayload, bomProblems, bomToForm, emptyBomForm, notOkFindings, type BomForm } from "./bomForm";

export function BomStatusBadge({ status, revision }: { status: Bom["status"]; revision: number }) {
  return status === "final"
    ? <Badge tone="ok" dot>Final · rev {revision}</Badge>
    : <Badge tone="warn" dot>{revision ? `Draft (rev ${revision + 1})` : "Draft"}</Badge>;
}

function Stepper({ bom }: { bom: Bom | null }) {
  const steps = [
    { label: "Draft saved", done: !!bom, at: bom?.createdAt },
    { label: "Finalized", done: bom?.status === "final", at: bom?.status === "final" ? bom.finalizedAt : null },
    { label: "E-mailed to store", done: bom?.status === "final" && !!bom.emailedAt && !bom.emailError, at: bom?.emailedAt, error: bom?.status === "final" && bom.emailError },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold",
              s.error ? "bg-danger text-white" : s.done ? "bg-ok text-white" : "bg-sunken text-faint")}>
              {s.error ? "!" : s.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            {i < steps.length - 1 && <span className={cn("mt-1 h-5 w-0.5 rounded-full", s.done ? "bg-ok/50" : "bg-line")} />}
          </div>
          <div className="pt-0.5">
            <div className={cn("text-sm font-semibold", s.done || s.error ? "text-ink" : "text-muted")}>{s.label}</div>
            <div className={cn("text-xs", s.error ? "text-danger" : "text-faint")}>{s.error ? "Not sent — see below" : s.at ? fmtDateTime(s.at) : "Pending"}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SendResult({ result, onClose }: { result: BomSendResult | null; onClose: () => void }) {
  return (
    <Modal open={!!result} onClose={onClose} size="md" title={result?.emailed ? "Bill of Materials sent" : "Finalized — e-mail not sent"}
      icon={result?.emailed ? <MailCheck className="h-5 w-5 text-ok" /> : <AlertTriangle className="h-5 w-5 text-danger" />}
      footer={<Button onClick={onClose}>Done</Button>}>
      {result && (<>
        <p className={cn("rounded-xl p-3 text-sm", result.emailed ? "bg-ok-soft text-ink" : "bg-danger-soft text-ink")}>{result.message}</p>
        <p className="mt-4 text-[13px] font-medium text-muted">Secure PDF link (valid until {fmtDate(result.expiresAt.slice(0, 10))}):</p>
        <div className="mt-1.5 flex gap-2">
          <Input readOnly value={result.link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard.writeText(result.link); toast.success("Link copied"); }}>Copy</Button>
        </div>
        <p className="mt-2 text-xs text-faint">Anyone with this link can open this revision's PDF until it expires. Deleting the BOM disables it.</p>
      </>)}
    </Modal>
  );
}

export function BomPage() {
  const { id } = useParams();
  const checklistId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { confirm } = useDialogs();
  const [form, setForm] = useState<BomForm | null>(null);
  const [saved, setSaved] = useState("");
  const [result, setResult] = useState<BomSendResult | null>(null);

  const checklist = useQuery({ queryKey: ["/checklists", checklistId], queryFn: () => api.get<ChecklistRecord>(`/checklists/${checklistId}`) });
  const bomQ = useQuery({
    queryKey: ["bom", checklistId],
    queryFn: () => api.get<Bom>(`/checklists/${checklistId}/bom`).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e; }),
  });
  const recipient = useQuery({
    queryKey: ["bom", checklistId, "recipient"],
    queryFn: () => api.get<{ storeEmail: string | null; ccEmails: string | null }>(`/checklists/${checklistId}/bom/recipient`),
    enabled: bomQ.data === null,
  });
  const bom = bomQ.data ?? null;

  // Initialise the form once data arrives (and after every save).
  useEffect(() => {
    if (bomQ.data === undefined || form) return;
    const f = bomQ.data ? bomToForm(bomQ.data) : emptyBomForm(user?.fullName ?? user?.email ?? "");
    setForm(f);
    setSaved(JSON.stringify(bomPayload(f)));
  }, [bomQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bomQ.data === null && recipient.data && form && !form.storeEmail && !form.ccEmails)
      setForm({ ...form, storeEmail: recipient.data.storeEmail ?? "", ccEmails: recipient.data.ccEmails ?? "" });
  }, [recipient.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const findings = useMemo(() => notOkFindings(checklist.data?.categories), [checklist.data]);
  const dirty = !!form && JSON.stringify(bomPayload(form)) !== saved;
  const locked = !!checklist.data?.archivedAt;

  const afterSave = (b: Bom) => {
    qc.setQueryData(["bom", checklistId], b);
    qc.invalidateQueries({ queryKey: ["/checklists"] });
    const f = bomToForm(b);
    setForm(f);
    setSaved(JSON.stringify(bomPayload(f)));
  };

  const save = useMutation({
    mutationFn: async () => {
      const problems = bomProblems(form!);
      if (problems.length) throw new Error(problems[0]);
      const body = bomPayload(form!);
      return bom ? api.put<Bom>(`/boms/${bom.id}`, body) : api.post<Bom>(`/checklists/${checklistId}/bom`, body);
    },
    onSuccess: (b) => { afterSave(b); toast.success(bom ? "Bill of Materials saved" : `${b.bomNumber} created`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const send = useMutation({
    mutationFn: async (kind: "finalize" | "resend") => {
      let current = bom;
      if (dirty || !current) current = await save.mutateAsync();
      return api.post<BomSendResult>(`/boms/${current!.id}/${current!.status === "final" && kind === "resend" ? "resend" : "finalize"}`);
    },
    onSuccess: (r) => { afterSave(r.bom); setResult(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/boms/${bom!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/checklists"] }); qc.removeQueries({ queryKey: ["bom", checklistId] }); toast.success("Bill of Materials deleted"); navigate(`/checklists/${checklistId}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (checklist.isLoading || bomQ.isLoading || !form) return <PageLoader />;
  if (checklist.isError) return <div className="p-8 text-center text-muted">{errorMessage(checklist.error)}</div>;
  const c = checklist.data!;
  const lines = bomPayload(form).items.length;
  const recipients = [form.storeEmail, ...form.ccEmails.split(/[,;]/)].map((s) => s.trim()).filter(Boolean);

  const finalize = async () => {
    const problems = [
      ...bomProblems(form),
      ...(!lines ? ["Add at least one material line."] : []),
      ...(!form.storeEmail.trim() ? ["Enter the store's e-mail address."] : []),
    ];
    if (problems.length) return toast.error(problems[0]);
    const nextRev = (bom?.revision ?? 0) + 1;
    if (await confirm({
      title: `Finalize & e-mail revision ${nextRev}?`,
      message: <div className="space-y-2">
        <p>The BOM is frozen as an official PDF (<b>{lines}</b> line{lines === 1 ? "" : "s"}) and a secure link valid for <b>30 days</b> is e-mailed to:</p>
        <ul className="list-disc pl-5 text-ink">{recipients.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="text-xs">You can still edit it later; finalizing again issues the next revision.</p>
      </div>,
      confirmLabel: "Finalize & e-mail",
    })) send.mutate("finalize");
  };

  const reopenWarning = bom?.status === "final" && dirty;
  const pdfUrl = (download = false) => `/api/v1/boms/${bom!.id}/pdf${download ? "?download=true" : ""}`;

  return (
    <div>
      <EditorHeader back={`/checklists/${checklistId}`} backLabel="Back to the checklist" icon={<Package className="h-5 w-5" />}
        title={bom ? bom.bomNumber : "New Bill of Materials"}
        subtitle={`${c.branchName ?? "Checklist"} · ${c.refNumber ?? `#${c.id}`}`}
        badge={bom ? <BomStatusBadge status={bom.status} revision={bom.revision} /> : <Badge tone="info">Not saved</Badge>}
        actions={<>
          {bom && <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(pdfUrl(), "_blank", "noopener")}>Print</Button>}
          {bom && <a href={pdfUrl(true)}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>PDF</Button></a>}
          {!locked && <>
            {bom && (isAdmin || bom.revision === 0) && (
              <Button variant="ghost" className="hover:text-danger" icon={<Trash2 className="h-4 w-4" />}
                onClick={async () => { if (await confirm({ title: `Delete ${bom.bomNumber}?`, message: "The Bill of Materials is removed and any e-mailed links stop working.", confirmLabel: "Delete", danger: true })) remove.mutate(); }}>Delete</Button>
            )}
            <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={save.isPending && !send.isPending}
              disabled={!!bom && !dirty} onClick={async () => {
                if (reopenWarning && !(await confirm({ title: "Reopen as a draft?", message: `Saving changes reopens ${bom!.bomNumber} as a draft. Finalize again to e-mail revision ${bom!.revision + 1}. The link already sent keeps showing revision ${bom!.revision}.`, confirmLabel: "Save as draft" }))) return;
                save.mutate();
              }}>{bom ? "Save" : "Save draft"}</Button>
            {bom?.status === "final" && !dirty
              ? <Button icon={<RefreshCw className="h-4 w-4" />} loading={send.isPending} onClick={async () => {
                  if (await confirm({ title: "Resend to the store?", message: `A fresh 30-day link to revision ${bom.revision} is e-mailed to ${recipients.join(", ")}.`, confirmLabel: "Resend" })) send.mutate("resend");
                }}>Resend</Button>
              : <Button icon={<Send className="h-4 w-4" />} loading={send.isPending} onClick={finalize}>Finalize & e-mail</Button>}
          </>}
        </>} />

      {locked && (
        <div className="mb-4 rounded-xl border border-line bg-surface-2 p-3.5 text-sm text-muted">
          The checklist is archived, so this Bill of Materials is read-only. You can still print or download it.
        </div>
      )}
      {reopenWarning && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent-soft p-3.5 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
          You're changing a finalized BOM. Saving reopens it as a draft; finalize again to send revision {bom!.revision + 1}.
        </motion.div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Locked locked={locked} className="space-y-6">
          <Section title={`Materials required${lines ? ` (${lines})` : ""}`} icon={<Package className="h-4 w-4" />}>
            <BomItemsEditor items={form.items} findings={findings} disabled={locked} onChange={(items) => setForm({ ...form, items })} />
          </Section>
          <Section title="Recipient & sign-off" icon={<Mail className="h-4 w-4" />}>
            <BomDetailsFields form={form} onChange={(p) => setForm({ ...form, ...p })} />
          </Section>
        </Locked>

        <div className="space-y-6 xl:sticky xl:top-36 xl:self-start">
          <Section title="Status" icon={<FileText className="h-4 w-4" />}>
            <Stepper bom={bom} />
            {bom?.status === "final" && bom.emailError && (
              <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{bom.emailError}</p>
            )}
            {bom?.status === "final" && bom.emailedTo && !bom.emailError && (
              <p className="mt-4 text-xs text-muted">Sent to <b className="text-ink">{bom.emailedTo}</b></p>
            )}
          </Section>

          <Section title="Checklist" icon={<ClipboardCheck className="h-4 w-4" />}>
            <dl className="space-y-2 text-sm">
              {[["Branch", c.branchName], ["Code", c.branchCode], ["Reference", c.refNumber], ["Inspected", fmtDate(c.checklistDate)]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v || "—"}</dd></div>
              ))}
              <div className="flex justify-between gap-3"><dt className="text-muted">NOT OK items</dt><dd><Badge tone={c.notOkCount ? "danger" : "neutral"}>{c.notOkCount}</Badge></dd></div>
            </dl>
            <Link to={`/checklists/${checklistId}`} className="mt-4 inline-block text-xs font-semibold text-accent-strong hover:underline">Open the checklist →</Link>
          </Section>

          {bom && bom.links.length > 0 && (
            <Section title="Sent links" icon={<Send className="h-4 w-4" />}>
              <ul className="space-y-3">
                {bom.links.map((l, i) => {
                  const expired = new Date(l.expiresAt + "Z") < new Date();
                  return (
                    <li key={i} className="rounded-xl border border-line p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-ink">Revision {l.revision}</b>
                        {l.revokedAt ? <Badge tone="neutral">Disabled</Badge> : expired ? <Badge tone="neutral">Expired</Badge> : <Badge tone="ok">Active</Badge>}
                      </div>
                      <div className="mt-1 text-muted">{fmtDateTime(l.createdAt)} → {l.sentTo || "—"}</div>
                      <div className="mt-0.5 text-faint">Expires {fmtDate(l.expiresAt.slice(0, 10))} · opened {l.downloadCount}×</div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <SendResult result={result} onClose={() => setResult(null)} />
    </div>
  );
}
