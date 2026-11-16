import { ClipboardCheck, Gauge, Lock, Share2, Store, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ChecklistBoard, Meter } from "@/components/graphics/Illustrations";
import { Avatar, Badge } from "@/components/ui/Surface";
import { CIRCUIT_TYPES, MEGGER_CIRCUITS } from "@/config/options";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/utils";
import type { ChecklistSummary, LoadBalancingSummary, MeggerSummary, StoreListSummary } from "@/types";
import { ShareDialog } from "../storeLists/ShareDialog";
import { DocumentList, type Column } from "./DocumentList";

const label = (opts: ReadonlyArray<{ value: string; label: string }>, v: string | null) => opts.find((o) => o.value === v)?.label ?? "—";

export function LoadBalancingList() {
  return (
    <DocumentList<LoadBalancingSummary>
      title="Load Balancing" subtitle="Panel load balancing and full-load test records." icon={<Gauge className="h-6 w-6" />}
      endpoint="/load-balancing" basePath="/load-balancing" searchPlaceholder="File name, ref ID, branch, company, panel…"
      emptyTitle="No load balancing records" emptyMessage="Measure each branch circuit and let the tool balance the phases for you."
      art={<Meter className="h-24 w-32" label="kVA" />} nameOf={(r) => r.fileName ?? `#${r.id}`}
      archive={{ noun: "load balancing records", dateVerb: "tested", leaves: "Leaves the active list and the dashboard's load balancing total." }}
      columns={[
        { header: "File", cell: (r) => <div><div className="font-medium text-ink">{r.fileName ?? "—"}</div><div className="text-xs text-muted">{r.refId}</div></div> },
        { header: "Site", cell: (r) => <div><div className="text-ink">{r.company ?? "—"}</div><div className="text-xs text-muted">{[r.branchCode, r.location].filter(Boolean).join(" · ")}</div></div> },
        { header: "Panel", cell: (r) => <span className="text-ink">{r.panel ?? "—"}</span> },
        { header: "System", cell: (r) => <Badge tone="info">{label(CIRCUIT_TYPES, r.circuitType).replace(/ \(.*/, "")}</Badge> },
        { header: "Total load", className: "text-right", cell: (r) => <span className="font-semibold tabular-nums text-ink">{r.totalLoad !== null ? `${fmtNum(r.totalLoad)} A` : "—"}</span> },
        { header: "kVA", className: "text-right", cell: (r) => <span className="tabular-nums text-muted">{fmtNum(r.kvaTotal, 3)}</span> },
        { header: "Test date", cell: (r) => <span className="whitespace-nowrap text-ink">{fmtDate(r.testDate)}</span> },
      ]}
    />
  );
}

export function MeggerList() {
  return (
    <DocumentList<MeggerSummary>
      title="Megger / Insulation Tests" subtitle="Insulation resistance test results by panel and branch circuit." icon={<Zap className="h-6 w-6" />}
      endpoint="/megger-tests" basePath="/megger" searchPlaceholder="File name, company, location, reference…"
      emptyTitle="No megger tests yet" emptyMessage="Record IR readings in MΩ — failed circuits are flagged automatically." nameOf={(r) => r.fileName ?? `#${r.id}`}
      archive={{ noun: "megger tests", dateVerb: "tested", leaves: "Leaves the active list and the dashboard's megger test total." }}
      columns={[
        { header: "File", cell: (r) => <div><div className="font-medium text-ink">{r.fileName ?? "—"}</div><div className="text-xs text-muted">{r.referenceNo}</div></div> },
        { header: "Company / location", cell: (r) => <div><div className="text-ink">{r.company ?? "—"}</div><div className="text-xs text-muted">{r.location}</div></div> },
        { header: "Circuit", cell: (r) => <span className="text-muted">{label(MEGGER_CIRCUITS, r.circuitType)}</span> },
        { header: "Result", cell: (r) => r.rowCount === 0 ? <span className="text-faint">—</span> : r.failedCount > 0
          ? <Badge tone="danger" dot pulse>{r.failedCount} failed / {r.rowCount}</Badge> : <Badge tone="ok" dot>All {r.rowCount} passed</Badge> },
        { header: "Conducted by", cell: (r) => <span className="text-muted">{r.conductedBy ?? "—"}</span> },
        { header: "Test date", cell: (r) => <span className="whitespace-nowrap text-ink">{fmtDate(r.testDate)}</span> },
      ]}
    />
  );
}

export function ChecklistList() {
  return (
    <DocumentList<ChecklistSummary>
      title="PM Checklists" subtitle="Branch preventive maintenance checklists." icon={<ClipboardCheck className="h-6 w-6" />}
      endpoint="/checklists" basePath="/checklists" searchPlaceholder="Branch, code, location, reference…"
      emptyTitle="No checklists yet" emptyMessage="Walk through panel boards, lighting, outlets, AC, FDAS and CCTV in one form."
      art={<ChecklistBoard className="h-28 w-24" />} nameOf={(r) => r.refNumber ?? r.branchName ?? `#${r.id}`}
      archive={{ noun: "checklists", dateVerb: "dated", leaves: "Leaves the active list and the dashboard's checklist total." }}
      columns={[
        { header: "Branch", cell: (r) => <div><div className="font-medium text-ink">{r.branchName ?? "—"}</div><div className="text-xs text-muted">{[r.branchCode, r.location].filter(Boolean).join(" · ")}</div></div> },
        { header: "Reference", cell: (r) => <span className="font-mono text-xs text-muted">{r.refNumber ?? "—"}</span> },
        { header: "Findings", cell: (r) => (
          <div className="flex flex-wrap gap-1">
            <Badge tone="ok">{r.okCount} OK</Badge>
            {r.notOkCount > 0 && <Badge tone="danger">{r.notOkCount} not OK</Badge>}
            {r.naCount > 0 && <Badge tone="neutral">{r.naCount} N/A</Badge>}
          </div>
        ) },
        { header: "Conducted by", cell: (r) => <span className="text-muted">{r.conductedBy ?? "—"}</span> },
        { header: "Date", cell: (r) => <span className="whitespace-nowrap text-ink">{fmtDate(r.checklistDate)}</span> },
      ]}
    />
  );
}

export function StoreListList() {
  const { isAdmin } = useAuth();
  const [sharing, setSharing] = useState<StoreListSummary | null>(null);
  const columns: Column<StoreListSummary>[] = [
    { header: "File name", cell: (r) => <span className="font-medium text-ink">{r.fileName ?? "—"}</span> },
    { header: "Areas", className: "text-right", cell: (r) => <span className="tabular-nums text-ink">{r.totalAreas}</span> },
    { header: "Main", className: "text-right", cell: (r) => <span className="tabular-nums text-ink">{r.totalMain}</span> },
    { header: "Sat", className: "text-right", cell: (r) => <span className="tabular-nums text-ink">{r.totalSat}</span> },
    { header: "Redemption", className: "text-right", cell: (r) => <span className="tabular-nums text-ink">{r.totalRedemption}</span> },
    ...(isAdmin ? [{
      header: "Shared with",
      cell: (r: StoreListSummary) => r.sharedWith.length === 0
        ? <Badge tone="neutral"><Lock className="h-3 w-3" /> Admins only</Badge>
        : (
          <div className="flex items-center gap-2" title={r.sharedWith.map((u) => u.fullName ?? u.email).join(", ")}>
            <div className="flex -space-x-2">
              {r.sharedWith.slice(0, 3).map((u) => <Avatar key={u.id} name={u.fullName ?? u.email} className="h-7 w-7 text-[10px] ring-2 ring-surface" />)}
            </div>
            <span className="text-xs text-muted">{r.sharedWith.length === 1 ? (r.sharedWith[0].fullName ?? r.sharedWith[0].email) : `${r.sharedWith.length} users`}</span>
          </div>
        ),
    }] : []),
    { header: "Saved", cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDateTime(r.savedAt)}</span> },
  ];
  return (
    <>
      <DocumentList<StoreListSummary>
        title="Store Lists" icon={<Store className="h-6 w-6" />}
        subtitle={isAdmin ? "Saved snapshots of the branches summary by area. Share a list to let specific users view and edit it." : "Store lists an administrator has shared with you."}
        endpoint="/store-lists" basePath="/store-lists" searchPlaceholder="File name…"
        emptyTitle={isAdmin ? "No store lists saved" : "Nothing shared with you yet"}
        emptyMessage={isAdmin ? "Build the branches summary across all areas and save monthly snapshots." : "Store lists are private to administrators. Ask an admin to share one with you."}
        nameOf={(r) => r.fileName ?? `#${r.id}`}
        canCreate={isAdmin}
        columns={columns}
        rowActions={isAdmin ? (r) => (
          <Button size="icon" variant="ghost" title="Share" onClick={() => setSharing(r)}><Share2 className="h-4 w-4" /></Button>
        ) : undefined}
      />
      {isAdmin && <ShareDialog list={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}
