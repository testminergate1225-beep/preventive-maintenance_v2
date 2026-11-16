import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Download, Eye, Lock, Paperclip, Pencil, Plus, Printer, RotateCcw, Trash2, Upload as UploadIcon, Wrench, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, EmptyState, LoadError, Pagination, rowMotion, SearchInput, Table, TableSkeleton } from "@/components/ui/Data";
import { Checkbox, Select } from "@/components/ui/Field";
import { Modal, useDialogs } from "@/components/ui/Modal";
import { Badge, Card, PageHeader, Segmented } from "@/components/ui/Surface";
import { EQUIPMENT, STATUSES, equipmentLabel, statusTone } from "@/config/options";
import { api, buildUrl, errorMessage } from "@/lib/api";
import { cn, fmtDate, fmtDateTime, relativeDays, todayISO } from "@/lib/utils";
import type { MaintenanceRecord, Page, Upload } from "@/types";
import { ArchiveDialog } from "./ArchiveDialog";
import { MaintenanceForm } from "./MaintenanceForm";
import { UploadDialog } from "./UploadDialog";

type Due = "" | "overdue" | "week" | "month";
type View = "active" | "archived";

export function useMaintenanceFilters() {
  const [sp, setSp] = useSearchParams();
  const f = {
    q: sp.get("q") ?? "",
    status: sp.get("status") ?? "",
    equipment: sp.get("equipment") ?? "",
    due: (sp.get("due") ?? "") as Due,
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    sort: sp.get("sort") ?? "-performedOn",
    page: Number(sp.get("page") ?? 1),
    deleted: sp.get("deleted") === "1",
    view: (sp.get("view") === "archived" ? "archived" : "active") as View,
  };
  const set = (patch: Partial<Record<keyof typeof f, string | number | boolean>>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v === false || v === undefined || (k === "page" && v === 1) || (k === "view" && v === "active")) next.delete(k);
      else next.set(k, v === true ? "1" : String(v));
    }
    if (!("page" in patch)) next.delete("page");
    setSp(next, { replace: true });
  };
  // Due filters only make sense for active records.
  const query = { q: f.q, status: f.status, equipment: f.equipment, due: f.view === "active" ? f.due : "", dateFrom: f.from, dateTo: f.to,
    view: f.view === "archived" ? "archived" : "" };
  return { f, set, query, sp, setSp };
}

function DueCell({ r }: { r: MaintenanceRecord }) {
  if (!r.nextDue) return <span className="text-faint">—</span>;
  const overdue = r.nextDue < todayISO();
  return (
    <div className="leading-tight">
      <div className={cn("font-medium", overdue ? "text-danger" : "text-ink")}>{fmtDate(r.nextDue)}</div>
      <div className={cn("text-xs", overdue ? "text-danger" : "text-muted")}>{relativeDays(r.nextDue)}</div>
    </div>
  );
}

function ArchiveNote({ r }: { r: MaintenanceRecord }) {
  return (
    <div className="leading-tight">
      <div className="font-medium text-ink">{fmtDate(r.archivedAt?.slice(0, 10))}</div>
      <div className="max-w-[180px] truncate text-xs text-muted" title={r.archiveReason ?? undefined}>{r.archiveReason || (r.archivedByName ? `by ${r.archivedByName}` : "")}</div>
    </div>
  );
}

function RecordDetail({ record, onClose, onEdit, onUpload, onUnarchive }: {
  record: MaintenanceRecord | null; onClose: () => void; onEdit: () => void; onUpload: () => void; onUnarchive?: () => void;
}) {
  const archived = !!record?.archivedAt;
  const files = useQuery({
    queryKey: ["uploads", "record", record?.id],
    queryFn: () => api.get<Page<Upload>>("/uploads", { recordId: record!.id, pageSize: 60 }),
    enabled: !!record,
  });
  const rows: Array<[string, React.ReactNode]> = record ? [
    ["Branch", `${record.branchName ?? "—"}${record.branchCode ? ` (${record.branchCode})` : ""}`],
    ["Location", record.location ?? "—"],
    ["Equipment", equipmentLabel(record.equipment)],
    ["Status", <Badge tone={statusTone(record.status)} dot>{record.status ?? "—"}</Badge>],
    ["Performed on", fmtDate(record.performedOn)],
    ["Next due", record.nextDue ? `${fmtDate(record.nextDue)} (${relativeDays(record.nextDue)})` : "—"],
    ["Performed by", record.performedBy ?? "—"],
    ["Verified by", record.verifiedBy ?? "—"],
    ["Logged by", `${record.createdByName ?? "—"} · ${fmtDateTime(record.createdAt)}`],
  ] : [];
  return (
    <Modal open={!!record} onClose={onClose} size="lg" icon={<Wrench className="h-5 w-5" />} title={record?.task} description={record ? `Record #${record.id}` : undefined}
      footer={archived ? (
        onUnarchive ? <Button variant="secondary" icon={<ArchiveRestore className="h-4 w-4" />} onClick={onUnarchive}>Unarchive</Button>
          : <Button variant="secondary" onClick={onClose}>Close</Button>
      ) : <>
        <Button variant="secondary" icon={<UploadIcon className="h-4 w-4" />} onClick={onUpload}>Attach files</Button>
        <Button icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>Edit</Button>
      </>}>
      {record?.archivedAt && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-muted"><Lock className="h-4 w-4" /></div>
          <div>
            <div className="font-semibold text-ink">Archived · read-only</div>
            <div className="text-muted">
              {fmtDateTime(record.archivedAt)}{record.archivedByName ? ` by ${record.archivedByName}` : ""}
              {record.archiveReason ? <> — “{record.archiveReason}”</> : null}
            </div>
            <div className="mt-0.5 text-xs text-faint">Not counted as overdue or due soon. {onUnarchive ? "Unarchive it to make changes." : "An administrator can unarchive it."}</div>
          </div>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-faint">{k}</dt><dd className="mt-0.5 text-sm text-ink">{v}</dd></div>
        ))}
      </dl>
      {record?.notes && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3.5 text-sm leading-relaxed text-ink"><div className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Notes</div>{record.notes}</div>
      )}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-faint"><Paperclip className="h-3.5 w-3.5" /> Attachments</div>
        {files.data?.items.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.data.items.map((u) => (
              <a key={u.id} href={u.url} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-sunken">
                {u.contentType?.startsWith("image") ? (
                  <img src={u.url} alt={u.originalName} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <video src={u.url} preload="metadata" muted className="h-full w-full object-cover" />
                )}
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-muted">{files.isLoading ? "Loading…" : "No files attached."}</p>}
      </div>
    </Modal>
  );
}

const plural = (n: number) => `${n} record${n === 1 ? "" : "s"}`;

export function MaintenancePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const { f, set, query, sp, setSp } = useMaintenanceFilters();
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<MaintenanceRecord | null>(null);
  const [viewing, setViewing] = useState<MaintenanceRecord | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const archivedView = f.view === "archived" && !f.deleted;

  useEffect(() => {
    if (sp.get("new") === "1") {
      setEditing(null);
      setFormOpen(true);
      const next = new URLSearchParams(sp);
      next.delete("new");
      setSp(next, { replace: true });
    }
  }, [sp, setSp]);

  // "Recently archived" only exists in the archive view.
  const sort = !archivedView && f.sort === "-archivedAt" ? "-performedOn" : f.sort;
  const params = useMemo(() => ({ ...query, sort, page: f.page, pageSize: 15, deleted: f.deleted || undefined }), [query, sort, f.page, f.deleted]);
  const list = useQuery({ queryKey: ["maintenance", params], queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", params), placeholderData: keepPreviousData });
  // Tab badges: totals for each view (ignoring filters).
  const [activeCount, archivedCount] = useQueries({
    queries: (["active", "archived"] as View[]).map((view) => ({
      queryKey: ["maintenance", "count", view],
      queryFn: () => api.get<Page<MaintenanceRecord>>("/maintenance", { view, pageSize: 1 }).then((p) => p.total),
    })),
  }).map((q) => q.data);

  // Selection belongs to what's on screen: reset it whenever the list changes.
  const key = JSON.stringify(params);
  useEffect(() => setSelected(new Set()), [key]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); qc.invalidateQueries({ queryKey: ["stats"] }); };
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/maintenance/${id}`),
    onSuccess: () => { refresh(); toast.success("Record moved to deleted items"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: (id: number) => api.post(`/maintenance/${id}/restore`),
    onSuccess: () => { refresh(); toast.success("Record restored"); },
  });
  const archiveOne = useMutation({
    mutationFn: (id: number) => api.post<{ count: number }>("/maintenance/archive", { ids: [id] }),
    onSuccess: (_, id) => {
      refresh();
      toast.success("Record archived", { action: { label: "Undo", onClick: () => unarchive.mutate([id]) } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unarchive = useMutation({
    mutationFn: (ids: number[]) => api.post<{ count: number }>("/maintenance/unarchive", { ids }),
    onSuccess: ({ count }) => { refresh(); setSelected(new Set()); setViewing(null); toast.success(`${plural(count)} returned to active records`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const confirmUnarchive = async (ids: number[]) => {
    if (await confirm({ title: `Unarchive ${plural(ids.length)}?`, message: "They return to the active list, become editable again and count towards overdue / due-soon tracking.", confirmLabel: "Unarchive" }))
      unarchive.mutate(ids);
  };

  const filtersActive = !!(f.q || f.status || f.equipment || (f.due && !archivedView) || f.from || f.to);
  const items = list.data?.items ?? [];
  const selectable = isAdmin && !f.deleted;
  const pageIds = items.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const printQuery = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);

  return (
    <div>
      <PageHeader title={archivedView ? "PM Records Archive" : "Preventive Maintenance Records"}
        subtitle={archivedView ? "Closed-out records — read-only, kept for history and reporting." : "Every inspection, repair and replacement logged on site."}
        icon={archivedView ? <Archive className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
        actions={<>
          <a href={buildUrl("/maintenance/export.csv", query)}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export CSV</Button></a>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/print/maintenance?${printQuery}`)}>Print</Button>
          {isAdmin && !archivedView && (
            <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)}>Archive…</Button>
          )}
          {!archivedView && <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New record</Button>}
        </>} />

      {!f.deleted && (
        <div className="mb-4">
          <Segmented layoutId="pm-view" value={f.view} onChange={(view) => set({ view, sort: "" })} options={[
            { value: "active", label: <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" />Active{activeCount != null && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-muted">{activeCount}</span>}</span> },
            { value: "archived", label: <span className="inline-flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" />Archive{archivedCount != null && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-muted">{archivedCount}</span>}</span> },
          ]} />
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput className="min-w-[220px] flex-1" value={f.q} onChange={(q) => set({ q })} placeholder="Search task, branch, equipment, technician…" />
            <Select className="w-[170px]" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
              <option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Select className="w-[190px]" value={f.equipment} onChange={(e) => set({ equipment: e.target.value })} aria-label="Equipment">
              <option value="">All equipment</option>{EQUIPMENT.map((e) => <option key={e.value + e.label} value={e.value}>{e.label}</option>)}
            </Select>
            <Select className="w-[170px]" value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
              <option value="-performedOn">Newest first</option>
              <option value="performedOn">Oldest first</option>
              {archivedView ? <option value="-archivedAt">Recently archived</option> : <option value="nextDue">Next due</option>}
              <option value="-createdAt">Recently logged</option>
              <option value="branch">Branch A–Z</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {archivedView ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" />Archived records are read-only and excluded from overdue / due-soon tracking.</p>
            ) : (
              <Segmented layoutId="due-filter" value={f.due} onChange={(due) => set({ due })}
                options={[{ value: "", label: "All" }, { value: "overdue", label: "Overdue" }, { value: "week", label: "Due ≤ 7 days" }, { value: "month", label: "Due ≤ 30 days" }]} />
            )}
            <DateRangeFilter value={{ from: f.from, to: f.to }} onChange={(r) => set({ from: r.from, to: r.to })} />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 self-start text-xs font-medium text-muted">
              <input type="checkbox" checked={f.deleted} onChange={(e) => set({ deleted: e.target.checked })} className="accent-amber-500" /> Show deleted records
            </label>
          )}
        </div>

        {list.isLoading ? <TableSkeleton cols={7} /> : list.isError && !list.data ? <LoadError error={list.error} onRetry={() => list.refetch()} /> : items.length === 0 ? (
          archivedView && !filtersActive ? (
            <EmptyState title="The archive is empty" art={<div className="grid h-24 w-24 place-items-center rounded-3xl bg-sunken text-faint"><Archive className="h-12 w-12" /></div>}
              message={isAdmin ? "Archive finished records — for example everything from previous years — to keep the active list focused." : "Records archived by an administrator will appear here."}
              action={isAdmin ? <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => { set({ view: "active" }); setArchiveOpen(true); }}>Archive records…</Button> : undefined} />
          ) : (
            <EmptyState title={filtersActive ? "No matching records" : "No maintenance records yet"}
              message={filtersActive ? "Try widening the filters or clearing the search." : "Log your first inspection or repair to start tracking."}
              action={filtersActive
                ? <Button variant="secondary" onClick={() => set({ q: "", status: "", equipment: "", due: "", from: "", to: "" })}>Clear filters</Button>
                : <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New record</Button>} />
          )
        ) : (
          <div className={cn("transition-opacity", list.isFetching && "opacity-70")}>
            <Table head={<>
              {selectable && (
                <th className="w-10"><Checkbox checked={allSelected} label={<span className="sr-only">Select all on this page</span>}
                  onChange={(on) => setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })} /></th>
              )}
              <th>Performed</th><th>Branch</th><th>Equipment</th><th>Task</th><th>Status</th><th>Performed by</th>
              <th>{archivedView ? "Archived" : "Next due"}</th><th className="text-right">Actions</th>
            </>}>
              <AnimatePresence initial={false}>
                {items.map((r, i) => (
                  <motion.tr key={r.id} {...rowMotion} transition={{ delay: i * 0.02 }}
                    className={cn("group cursor-pointer hover:bg-surface-2", selected.has(r.id) && "bg-accent-soft/60 hover:bg-accent-soft")} onClick={() => setViewing(r)}>
                    {selectable && (
                      <td onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} label={<span className="sr-only">Select record {r.id}</span>} /></td>
                    )}
                    <td className="whitespace-nowrap text-ink">{fmtDate(r.performedOn)}</td>
                    <td><div className="font-medium text-ink">{r.branchName ?? "—"}</div><div className="text-xs text-muted">{r.branchCode}</div></td>
                    <td className="text-ink">{equipmentLabel(r.equipment)}</td>
                    <td className="max-w-[280px]">
                      <div className="truncate text-ink">{r.task}</div>
                      {r.uploadCount > 0 && <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"><Paperclip className="h-3 w-3" />{r.uploadCount} file{r.uploadCount > 1 ? "s" : ""}</div>}
                    </td>
                    <td><Badge tone={statusTone(r.status)} dot>{r.status ?? "—"}</Badge></td>
                    <td className="max-w-[200px] truncate text-muted">{r.performedBy ?? "—"}</td>
                    <td>{r.archivedAt ? <ArchiveNote r={r} /> : <DueCell r={r} />}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1 opacity-80 transition group-hover:opacity-100">
                        {r.deletedAt ? (
                          <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(r.id)}>Restore</Button>
                        ) : r.archivedAt ? (<>
                          <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" title="Unarchive" onClick={() => confirmUnarchive([r.id])}><ArchiveRestore className="h-4 w-4" /></Button>
                          )}
                        </>) : (<>
                          <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Attach photos / videos" onClick={() => setUploadFor(r)}><UploadIcon className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" title="Archive" onClick={() => archiveOne.mutate(r.id)}><Archive className="h-4 w-4" /></Button>
                          )}
                        </>)}
                        {isAdmin && !r.deletedAt && (
                          <Button size="icon" variant="ghost" title="Delete" className="hover:text-danger"
                            onClick={async () => { if (await confirm({ title: "Delete this record?", message: "It can be restored by an administrator later.", confirmLabel: "Delete", danger: true })) remove.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </Table>
            <Pagination page={f.page} pageSize={15} total={list.data?.total ?? 0} onPage={(page) => set({ page })} />
          </div>
        )}
      </Card>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="no-print fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-pop">
            <span className="mr-1 text-sm font-semibold text-ink">{plural(selected.size)} selected</span>
            {archivedView ? (
              <Button size="sm" icon={<ArchiveRestore className="h-3.5 w-3.5" />} loading={unarchive.isPending} onClick={() => confirmUnarchive([...selected])}>Unarchive</Button>
            ) : (
              <Button size="sm" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => setArchiveOpen(true)}>Archive…</Button>
            )}
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setSelected(new Set())}>Clear</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <MaintenanceForm open={formOpen} record={editing} onClose={() => setFormOpen(false)} />
      <UploadDialog open={!!uploadFor} record={uploadFor} onClose={() => setUploadFor(null)} />
      <ArchiveDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} selectedIds={archivedView ? [] : [...selected]} onArchived={() => setSelected(new Set())} />
      <RecordDetail record={viewing} onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}
        onUpload={() => { setUploadFor(viewing); setViewing(null); }}
        onUnarchive={isAdmin && viewing ? () => confirmUnarchive([viewing.id]) : undefined} />
    </div>
  );
}

