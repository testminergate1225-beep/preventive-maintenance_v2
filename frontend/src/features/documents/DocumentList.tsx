import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Eye, Lock, Pencil, Plus, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, EmptyState, LoadError, Pagination, rowMotion, SearchInput, Table, TableSkeleton, type DateRange } from "@/components/ui/Data";
import { Checkbox } from "@/components/ui/Field";
import { useDialogs } from "@/components/ui/Modal";
import { Card, PageHeader, Segmented } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";
import type { Page } from "@/types";
import { ArchiveDialog, plural, type ArchiveKind } from "../archive/ArchiveDialog";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

type View = "active" | "archived";
type Row = { id: number; deletedAt: string | null; archivedAt?: string | null; archivedByName?: string | null; archiveReason?: string | null };

export function DocumentList<T extends Row>({
  title, subtitle, icon, endpoint, basePath, columns, searchPlaceholder, emptyTitle, emptyMessage, nameOf, art,
  canCreate = true, rowActions, banner, archive,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  endpoint: string;
  basePath: string;
  columns: Column<T>[];
  searchPlaceholder: string;
  emptyTitle: string;
  emptyMessage: string;
  nameOf: (row: T) => string;
  art?: ReactNode;
  /** Show the "New" buttons (false when the user isn't allowed to create). */
  canCreate?: boolean;
  /** Extra per-row action buttons, rendered before Edit/Print/Delete. */
  rowActions?: (row: T) => ReactNode;
  /** Optional notice shown above the table. */
  banner?: ReactNode;
  /** Enables the Active / Archive tabs and archive actions for this record type. */
  archive?: Omit<ArchiveKind, "endpoint">;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [deleted, setDeleted] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [archiveOpen, setArchiveOpen] = useState(false);

  const kind: ArchiveKind | undefined = archive && { ...archive, endpoint };
  const view: View = kind && sp.get("view") === "archived" ? "archived" : "active";
  const archivedView = view === "archived" && !deleted;
  const setView = (v: View) => {
    const next = new URLSearchParams(sp);
    if (v === "archived") next.set("view", "archived"); else next.delete("view");
    setSp(next, { replace: true });
    setPage(1);
  };

  const params = { q, dateFrom: range.from, dateTo: range.to, page, pageSize: 20, deleted: deleted || undefined, view: kind ? view : undefined };
  const list = useQuery({ queryKey: [endpoint, params], queryFn: () => api.get<Page<T>>(endpoint, params), placeholderData: keepPreviousData });
  const [activeCount, archivedCount] = useQueries({
    queries: (["active", "archived"] as View[]).map((v) => ({
      queryKey: [endpoint, "count", v],
      queryFn: () => api.get<Page<T>>(endpoint, { view: v, pageSize: 1 }).then((p) => p.total),
      enabled: !!kind,
    })),
  }).map((r) => r.data);

  // Selection belongs to what's on screen: reset it whenever the list changes.
  const key = JSON.stringify(params);
  useEffect(() => setSelected(new Set()), [key]);

  const refresh = () => { qc.invalidateQueries({ queryKey: [endpoint] }); qc.invalidateQueries({ queryKey: ["stats"] }); };
  const del = useMutation({
    mutationFn: (id: number) => api.del(`${endpoint}/${id}`),
    onSuccess: () => { refresh(); toast.success("Deleted"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: (id: number) => api.post(`${endpoint}/${id}/restore`),
    onSuccess: () => { refresh(); toast.success("Restored"); },
  });
  const unarchive = useMutation({
    mutationFn: (ids: number[]) => api.post<{ count: number }>(`${endpoint}/unarchive`, { ids }),
    onSuccess: ({ count }) => { refresh(); setSelected(new Set()); toast.success(`${plural(count, kind?.noun ?? "records")} returned to the active list`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archiveOne = useMutation({
    mutationFn: (id: number) => api.post<{ count: number }>(`${endpoint}/archive`, { ids: [id] }),
    onSuccess: (_, id) => { refresh(); toast.success("Archived", { action: { label: "Undo", onClick: () => unarchive.mutate([id]) } }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const confirmUnarchive = async (ids: number[]) => {
    if (await confirm({ title: `Unarchive ${plural(ids.length, kind?.noun ?? "records")}?`, message: "They return to the active list and become editable again.", confirmLabel: "Unarchive" }))
      unarchive.mutate(ids);
  };

  const items = list.data?.items ?? [];
  const filtered = !!(q || range.from || range.to);
  const selectable = !!kind && isAdmin && !deleted;
  const pageIds = items.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const badge = (n: number | undefined) => n != null && <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-muted">{n}</span>;

  return (
    <div>
      <PageHeader title={archivedView ? `${title} Archive` : title}
        subtitle={archivedView ? "Closed-out records — read-only, kept for reference and printing." : subtitle}
        icon={archivedView ? <Archive className="h-6 w-6" /> : icon}
        actions={!archivedView && (<>
          {kind && isAdmin && <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)}>Archive…</Button>}
          {canCreate && <Link to={`${basePath}/new`}><Button icon={<Plus className="h-4 w-4" />}>New</Button></Link>}
        </>)} />
      {banner}
      {kind && !deleted && (
        <div className="mb-4">
          <Segmented layoutId={`${endpoint}-view`} value={view} onChange={setView} options={[
            { value: "active", label: <span className="inline-flex items-center gap-1.5">{icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}Active{badge(activeCount)}</span> },
            { value: "archived", label: <span className="inline-flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" />Archive{badge(archivedCount)}</span> },
          ]} />
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={searchPlaceholder} />
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              <input type="checkbox" checked={deleted} onChange={(e) => { setDeleted(e.target.checked); setPage(1); }} className="accent-amber-500" /> Deleted
            </label>
          )}
          {archivedView && <p className="inline-flex w-full items-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" />Archived records are read-only. Open one to view or print it.</p>}
        </div>
        {list.isLoading ? <TableSkeleton cols={columns.length + 1} /> : list.isError && !list.data ? <LoadError error={list.error} onRetry={() => list.refetch()} /> : items.length === 0 ? (
          archivedView && !filtered ? (
            <EmptyState title="The archive is empty" art={<div className="grid h-24 w-24 place-items-center rounded-3xl bg-sunken text-faint"><Archive className="h-12 w-12" /></div>}
              message={isAdmin ? `Archive finished ${kind!.noun} — for example everything from previous years — to keep the active list focused.` : "Records archived by an administrator will appear here."}
              action={isAdmin ? <Button variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => { setView("active"); setArchiveOpen(true); }}>Archive records…</Button> : undefined} />
          ) : (
            <EmptyState art={art} title={filtered ? "Nothing matches your filters" : emptyTitle} message={filtered ? "Try a different search or date range." : emptyMessage}
              action={!filtered && canCreate && <Link to={`${basePath}/new`}><Button icon={<Plus className="h-4 w-4" />}>Create the first one</Button></Link>} />
          )
        ) : (
          <div className={cn("transition-opacity", list.isFetching && "opacity-70")}>
            <Table head={<>
              {selectable && (
                <th className="w-10"><Checkbox checked={allSelected} label={<span className="sr-only">Select all on this page</span>}
                  onChange={(on) => setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })} /></th>
              )}
              {columns.map((c) => <th key={c.header} className={c.className}>{c.header}</th>)}
              {archivedView && <th>Archived</th>}
              <th className="text-right">Actions</th>
            </>}>
              <AnimatePresence initial={false}>
                {items.map((row, i) => (
                  <motion.tr key={row.id} {...rowMotion} transition={{ delay: i * 0.02 }}
                    className={cn("group cursor-pointer hover:bg-surface-2", selected.has(row.id) && "bg-accent-soft/60 hover:bg-accent-soft")}
                    onClick={() => !row.deletedAt && navigate(`${basePath}/${row.id}`)}>
                    {selectable && (
                      <td onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(row.id)} onChange={() => toggle(row.id)} label={<span className="sr-only">Select {nameOf(row)}</span>} /></td>
                    )}
                    {columns.map((c) => <td key={c.header} className={c.className}>{c.cell(row)}</td>)}
                    {archivedView && (
                      <td>
                        <div className="leading-tight">
                          <div className="whitespace-nowrap font-medium text-ink">{fmtDate(row.archivedAt?.slice(0, 10))}</div>
                          <div className="max-w-[180px] truncate text-xs text-muted" title={row.archiveReason ?? undefined}>{row.archiveReason || (row.archivedByName ? `by ${row.archivedByName}` : "")}</div>
                        </div>
                      </td>
                    )}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {row.deletedAt ? (
                          <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(row.id)}>Restore</Button>
                        ) : row.archivedAt ? (<>
                          <Button size="icon" variant="ghost" title="View" onClick={() => navigate(`${basePath}/${row.id}`)}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Print" onClick={() => navigate(`/print${basePath}/${row.id}`)}><Printer className="h-4 w-4" /></Button>
                          {isAdmin && <Button size="icon" variant="ghost" title="Unarchive" onClick={() => confirmUnarchive([row.id])}><ArchiveRestore className="h-4 w-4" /></Button>}
                        </>) : (<>
                          {rowActions?.(row)}
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => navigate(`${basePath}/${row.id}`)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Print" onClick={() => navigate(`/print${basePath}/${row.id}`)}><Printer className="h-4 w-4" /></Button>
                          {kind && isAdmin && <Button size="icon" variant="ghost" title="Archive" onClick={() => archiveOne.mutate(row.id)}><Archive className="h-4 w-4" /></Button>}
                        </>)}
                        {isAdmin && !row.deletedAt && (
                          <Button size="icon" variant="ghost" title="Delete" className="hover:text-danger"
                            onClick={async () => { if (await confirm({ title: `Delete "${nameOf(row)}"?`, message: "An administrator can restore it later.", confirmLabel: "Delete", danger: true })) del.mutate(row.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data?.total ?? 0} onPage={setPage} />
          </div>
        )}
      </Card>

      {kind && (<>
        {/* Bulk action bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="no-print fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-pop">
              <span className="mr-1 text-sm font-semibold text-ink">{selected.size} selected</span>
              {archivedView ? (
                <Button size="sm" icon={<ArchiveRestore className="h-3.5 w-3.5" />} loading={unarchive.isPending} onClick={() => confirmUnarchive([...selected])}>Unarchive</Button>
              ) : (
                <Button size="sm" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => setArchiveOpen(true)}>Archive…</Button>
              )}
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setSelected(new Set())}>Clear</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <ArchiveDialog kind={kind} open={archiveOpen} onClose={() => setArchiveOpen(false)}
          selectedIds={archivedView ? [] : [...selected]} onArchived={() => setSelected(new Set())} />
      </>)}
    </div>
  );
}
