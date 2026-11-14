import { useQuery } from "@tanstack/react-query";
import { BarChart3, Medal, Plus, Printer, Trophy, Users, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter, type DateRange } from "@/components/ui/Data";
import { Input } from "@/components/ui/Field";
import { Card, CardHeader, PageHeader, Segmented, Skeleton } from "@/components/ui/Surface";
import { api } from "@/lib/api";
import { individualCounts, teamCounts, type PerformerCount } from "@/lib/calc/performers";
import { cn } from "@/lib/utils";

const PALETTE = ["#f59e0b", "#3b82f6", "#ec4899", "#10b981", "#8b5cf6", "#f97316", "#06b6d4"];

function Podium({ entries }: { entries: Array<{ label: string; value: number; sub?: string }> }) {
  const ranked = [...entries].sort((a, b) => b.value - a.value).slice(0, 3);
  const order = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const heights = { 0: "h-28", 1: "h-20", 2: "h-14" } as Record<number, string>;
  const medal = ["text-amber-400", "text-slate-300", "text-orange-400"];
  return (
    <div className="flex items-end justify-center gap-3 px-4 pt-6">
      {order.map((e) => {
        const rank = ranked.indexOf(e);
        return (
          <motion.div key={e.label} className="flex w-1/3 max-w-[160px] flex-col items-center" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + (2 - rank) * 0.12, type: "spring", stiffness: 200, damping: 18 }}>
            <motion.div animate={rank === 0 ? { rotate: [0, -8, 8, 0] } : {}} transition={{ delay: 0.9, duration: 0.6 }}>
              {rank === 0 ? <Trophy className={cn("h-9 w-9", medal[rank])} /> : <Medal className={cn("h-7 w-7", medal[rank])} />}
            </motion.div>
            <div className="mt-1 text-center text-[13px] font-semibold leading-tight text-ink">{e.label}</div>
            {e.sub && <div className="text-center text-[11px] text-muted">{e.sub}</div>}
            <div className="mt-1 font-display text-xl font-bold text-ink">{e.value}</div>
            <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + (2 - rank) * 0.12, duration: 0.5 }}
              className={cn("mt-2 w-full origin-bottom rounded-t-xl", heights[rank], rank === 0 ? "bg-gradient-to-t from-amber-500 to-amber-300" : "bg-gradient-to-t from-slate-400 to-slate-200 dark:from-slate-700 dark:to-slate-600")}>
              <div className="pt-2 text-center font-display text-lg font-bold text-black/60">#{rank + 1}</div>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, icon, data, layoutId }: { title: string; icon: React.ReactNode; data: Array<{ label: string; value: number }>; layoutId: string }) {
  const [type, setType] = useState<"pie" | "bar">("bar");
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader title={title} subtitle={`${total} record${total === 1 ? "" : "s"} counted`} icon={icon}
        actions={<Segmented layoutId={layoutId} value={type} onChange={setType} options={[{ value: "bar", label: "Bar" }, { value: "pie", label: "Pie" }]} />} />
      <div className="h-[300px] p-4">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={data} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--app-muted)", fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--app-faint)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "var(--app-sunken)" }} contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12 }} />
              <Bar dataKey="value" name="Records" radius={[8, 8, 0, 0]} animationDuration={900}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          ) : (
            <PieChart>
              <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="label" outerRadius={110} innerRadius={50} paddingAngle={2} strokeWidth={0} animationDuration={900}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {data.filter((d) => d.value > 0).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="w-full border-t border-line text-sm">
        <tbody>
          {[...data].sort((a, b) => b.value - a.value).map((d, i) => (
            <tr key={d.label} className="border-b border-line last:border-0">
              <td className="w-10 px-4 py-2 text-xs font-bold text-faint">#{i + 1}</td>
              <td className="py-2 text-ink">{d.label}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{d.value}</td>
              <td className="w-20 px-4 py-2 text-right text-xs text-muted">{total ? ((d.value / total) * 100).toFixed(1) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function PerformancePage() {
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [custom, setCustom] = useState<string | undefined>();
  const [customInput, setCustomInput] = useState("");
  const q = useQuery({ queryKey: ["stats", "performers", range], queryFn: () => api.get<PerformerCount[]>("/stats/performers", { dateFrom: range.from, dateTo: range.to }) });
  const rows = q.data ?? [];
  const teams = teamCounts(rows);
  const people = individualCounts(rows, custom);

  return (
    <div>
      <PageHeader title="Top Performers" subtitle="Maintenance records completed by team and technician." icon={<BarChart3 className="h-6 w-6" />}
        actions={<Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>} />
      <Card className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (customInput.trim()) { setCustom(customInput.trim()); setCustomInput(""); } }}>
          {custom ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
              + {custom}<button type="button" onClick={() => setCustom(undefined)} aria-label="Remove"><X className="h-3 w-3" /></button>
            </span>
          ) : (<>
            <Input className="h-9 w-48" value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Add another technician…" />
            <Button size="sm" type="submit" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />}>Add</Button>
          </>)}
        </form>
      </Card>

      {q.isLoading ? <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-[460px] rounded-2xl" /><Skeleton className="h-[460px] rounded-2xl" /></div> : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader title="Top team" icon={<Users className="h-[18px] w-[18px]" />} /><Podium entries={teams.map((t) => ({ label: t.label, value: t.value, sub: t.members.join(" & ") }))} /></Card>
            <Card><CardHeader title="Top technician" icon={<Trophy className="h-[18px] w-[18px]" />} /><Podium entries={people} /></Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="By team (pairs)" icon={<Users className="h-[18px] w-[18px]" />} data={teams} layoutId="chart-team" />
            <ChartCard title="By technician" icon={<Trophy className="h-[18px] w-[18px]" />} data={people} layoutId="chart-indiv" />
          </div>
          <p className="text-xs text-muted">Pairs are counted once per record regardless of name order. A technician is credited for solo and paired records. Older spellings (e.g. "Joseph Cristal") count toward the canonical name.</p>
        </div>
      )}
    </div>
  );
}
