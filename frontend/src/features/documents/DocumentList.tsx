import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, EmptyState, Pagination, rowMotion, SearchInput, Table, TableSkeleton, type DateRange } from "@/components/ui/Data";
import { useDialogs } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/Surface";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Page } from "@/types";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DocumentList<T extends { id: number; deletedAt: string | null }>({
  title, subtitle, icon, endpoint, basePath, columns, searchPlaceholder, emptyTitle, emptyMessage, nameOf, art,
  canCreate = true, rowActions, banner,
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
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [deleted, setDeleted] = useState(false);
  const params = { q, dateFrom: range.from, dateTo: range.to, page, pageSize: 20, deleted: deleted || undefined };
  const list = useQuery({ queryKey: [endpoint, params], queryFn: () => api.get<Page<T>>(endpoint, params), placeholderData: keepPreviousData });

  const del = useMutation({
    mutationFn: (id: number) => api.del(`${endpoint}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); qc.invalidateQueries({ queryKey: ["stats"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: (id: number) => api.post(`${endpoint}/${id}/restore`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); toast.success("Restored"); },
  });

  const items = list.data?.items ?? [];
  const filtered = !!(q || range.from || range.to);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} icon={icon}
        actions={canCreate ? <Link to={`${basePath}/new`}><Button icon={<Plus className="h-4 w-4" />}>New</Button></Link> : undefined} />
      {banner}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={searchPlaceholder} />
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              <input type="checkbox" checked={deleted} onChange={(e) => { setDeleted(e.target.checked); setPage(1); }} className="accent-amber-500" /> Deleted
            </label>
          )}
        </div>
        {list.isLoading ? <TableSkeleton cols={columns.length + 1} /> : items.length === 0 ? (
          <EmptyState art={art} title={filtered ? "Nothing matches your filters" : emptyTitle} message={filtered ? "Try a different search or date range." : emptyMessage}
            action={!filtered && canCreate && <Link to={`${basePath}/new`}><Button icon={<Plus className="h-4 w-4" />}>Create the first one</Button></Link>} />
        ) : (
          <div className={cn("transition-opacity", list.isFetching && "opacity-70")}>
            <Table head={<>{columns.map((c) => <th key={c.header} className={c.className}>{c.header}</th>)}<th className="text-right">Actions</th></>}>
              <AnimatePresence initial={false}>
                {items.map((row, i) => (
                  <motion.tr key={row.id} {...rowMotion} transition={{ delay: i * 0.02 }} className="group cursor-pointer hover:bg-surface-2"
                    onClick={() => !row.deletedAt && navigate(`${basePath}/${row.id}`)}>
                    {columns.map((c) => <td key={c.header} className={c.className}>{c.cell(row)}</td>)}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {row.deletedAt ? (
                          <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(row.id)}>Restore</Button>
                        ) : (<>
                          {rowActions?.(row)}
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => navigate(`${basePath}/${row.id}`)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Print" onClick={() => navigate(`/print${basePath}/${row.id}`)}><Printer className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" title="Delete" className="hover:text-danger"
                              onClick={async () => { if (await confirm({ title: `Delete "${nameOf(row)}"?`, message: "An administrator can restore it later.", confirmLabel: "Delete", danger: true })) del.mutate(row.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>)}
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
    </div>
  );
}
