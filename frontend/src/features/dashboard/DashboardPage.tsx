import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Gauge, Images, LayoutDashboard, Plus, Store, Wrench, Zap,
} from "lucide-react";
import { motion } from "motion/react";
import type { ComponentType, ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/auth/AuthProvider";
import { Gear } from "@/components/graphics/Gear";
import { ChecklistBoard, Meter } from "@/components/graphics/Illustrations";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { equipmentLabel, statusTone, type Tone } from "@/config/options";
import { api } from "@/lib/api";
import { fmtDate, relativeDays } from "@/lib/utils";
import type { Dashboard } from "@/types";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--app-ok)", warn: "var(--app-warn)", danger: "var(--app-danger)", info: "var(--app-info)", neutral: "var(--app-faint)",
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24 } } };

function Kpi({ label, value, icon: Icon, tone, hint, to }: { label: string; value: number; icon: ComponentType<{ className?: string }>; tone: Tone; hint?: ReactNode; to: string }) {
  const navigate = useNavigate();
  return (
    <motion.div variants={item}>
      <Card hover onClick={() => navigate(to)} className="group relative cursor-pointer overflow-hidden p-5">
        <div className="absolute -right-6 -top-6 opacity-[0.07] transition-transform duration-700 group-hover:rotate-90">
          <Gear size={110} teeth={12} duration={60} color={TONE_COLOR[tone]} spokes={false} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-muted">{label}</span>
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${TONE_COLOR[tone]} 14%, transparent)`, color: TONE_COLOR[tone] }}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        </div>
        <div className="mt-3 font-display text-3xl font-bold text-ink"><AnimatedNumber value={value} /></div>
        {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      </Card>
    </motion.div>
  );
}

function ModuleTile({ to, icon: Icon, label, count, art }: { to: string; icon: ComponentType<{ className?: string }>; label: string; count: number; art?: ReactNode }) {
  return (
    <motion.div variants={item}>
      <Link to={to}>
        <Card hover className="group flex items-center gap-4 p-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sunken text-ink transition group-hover:bg-accent group-hover:text-accent-ink">
            {art ?? <Icon className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{label}</div>
            <div className="text-xs text-muted">{count.toLocaleString()} saved</div>
          </div>
          <ArrowRight className="h-4 w-4 text-faint transition group-hover:translate-x-1 group-hover:text-ink" />
        </Card>
      </Link>
    </motion.div>
  );
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["stats", "dashboard"], queryFn: () => api.get<Dashboard>("/stats/dashboard") });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="relative mb-6 overflow-hidden rounded-3xl bg-[#0b1220] p-6 text-white shadow-pop sm:p-8">
        <div className="blueprint absolute inset-0 opacity-40" />
        <div className="absolute -right-10 -top-12 hidden sm:block"><Gear size={220} teeth={16} duration={30} color="rgba(245,158,11,.18)" /></div>
        <div className="absolute bottom-[-40px] right-40 hidden md:block"><Gear size={120} teeth={10} duration={20} reverse color="rgba(148,163,184,.18)" /></div>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
              <LayoutDashboard className="h-4 w-4" /> Operations overview
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{greeting}, {user?.fullName?.split(" ")[0] ?? "team"}.</h1>
            <p className="mt-2 max-w-lg text-sm text-slate-400">
              {data ? (
                data.overdue > 0
                  ? `${data.overdue} item${data.overdue === 1 ? " is" : "s are"} past due and ${data.dueSoon} due within a week.`
                  : `Nothing overdue. ${data.dueSoon} item${data.dueSoon === 1 ? "" : "s"} due within the next 7 days.`
              ) : "Loading your maintenance status…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/maintenance?new=1"><Button icon={<Plus className="h-4 w-4" />}>New PM record</Button></Link>
            <Link to="/load-balancing/new"><Button variant="secondary" className="border-white/10 bg-white/10 text-white hover:bg-white/15" icon={<Gauge className="h-4 w-4" />}>Load test</Button></Link>
          </div>
        </div>
      </motion.div>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}</div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="PM records" value={data.counts.maintenance} icon={Wrench} tone="info" to="/maintenance" hint="All maintenance entries" />
            <Kpi label="Completed this month" value={data.completedThisMonth} icon={CheckCircle2} tone="ok" to="/maintenance" hint="Performed since the 1st" />
            <Kpi label="Due in 7 days" value={data.dueSoon} icon={CalendarClock} tone="warn" to="/maintenance?due=week" hint="Upcoming next-due dates" />
            <Kpi label="Overdue" value={data.overdue} icon={AlertTriangle} tone={data.overdue ? "danger" : "neutral"} to="/maintenance?due=overdue" hint="Next-due date has passed" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <motion.div variants={item} className="xl:col-span-2">
              <Card className="h-full">
                <CardHeader title="Maintenance activity" subtitle="Records performed per month (last 12 months)" icon={<Wrench className="h-[18px] w-[18px]" />} />
                <div className="h-[280px] px-2 pb-4 pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthly.map((b) => ({ ...b, month: monthLabel(b.label) }))} margin={{ left: -18, right: 12 }}>
                      <defs>
                        <linearGradient id="fillAmber" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "var(--app-faint)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: "var(--app-faint)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ stroke: "var(--app-accent)", strokeDasharray: 4 }}
                        contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, color: "var(--app-text)" }} />
                      <Area type="monotone" dataKey="count" name="Records" stroke="var(--app-accent-strong)" strokeWidth={2.5} fill="url(#fillAmber)" animationDuration={1200} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="h-full">
                <CardHeader title="Equipment status" subtitle="By recorded status" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
                {data.statusBreakdown.length === 0 ? (
                  <p className="p-6 text-sm text-muted">No records yet.</p>
                ) : (
                  <div className="p-4">
                    <div className="relative h-[170px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.statusBreakdown} dataKey="count" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0} animationDuration={1000}>
                            {data.statusBreakdown.map((b) => <Cell key={b.label} fill={TONE_COLOR[statusTone(b.label)]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div><div className="font-display text-2xl font-bold text-ink">{data.counts.maintenance}</div><div className="text-[11px] text-muted">records</div></div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {data.statusBreakdown.slice(0, 6).map((b) => (
                        <li key={b.label} className="flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[statusTone(b.label)] }} />{b.label}</span>
                          <span className="font-semibold tabular-nums text-ink">{b.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </motion.div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <motion.div variants={item}>
              <Card className="h-full">
                <CardHeader title="Coming up" subtitle="Next scheduled maintenance" icon={<CalendarClock className="h-[18px] w-[18px]" />}
                  actions={<Link to="/maintenance?sort=nextDue" className="text-xs font-semibold text-accent-strong hover:underline">View all</Link>} />
                {data.upcoming.length === 0 ? <p className="p-6 text-sm text-muted">No upcoming due dates scheduled.</p> : (
                  <ul className="divide-y divide-line">
                    {data.upcoming.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-center leading-none text-warn">
                          <div><div className="text-[10px] font-bold uppercase">{fmtDate(r.nextDue).split(" ")[0]}</div><div className="text-sm font-bold">{r.nextDue?.slice(8, 10)}</div></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{r.task}</div>
                          <div className="truncate text-xs text-muted">{r.branchName ?? r.branchCode ?? "—"} · {equipmentLabel(r.equipment)}</div>
                        </div>
                        <span className="text-xs font-medium text-muted">{relativeDays(r.nextDue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="h-full">
                <CardHeader title="Recently logged" subtitle="Latest PM entries" icon={<Wrench className="h-[18px] w-[18px]" />}
                  actions={<Link to="/maintenance" className="text-xs font-semibold text-accent-strong hover:underline">Open records</Link>} />
                {data.recent.length === 0 ? <p className="p-6 text-sm text-muted">Nothing logged yet.</p> : (
                  <ul className="divide-y divide-line">
                    {data.recent.map((r) => (
                      <li key={r.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">{r.task}</span>
                          <Badge tone={statusTone(r.status)} dot>{r.status ?? "—"}</Badge>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted">{fmtDate(r.performedOn)} · {r.performedBy ?? "—"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.div>

            <motion.div variants={item} className="space-y-3">
              <ModuleTile to="/load-balancing" icon={Gauge} label="Load Balancing" count={data.counts.loadBalancing} art={<Meter className="h-8 w-10" label="" />} />
              <ModuleTile to="/megger" icon={Zap} label="Megger / IR Tests" count={data.counts.meggerTests} />
              <ModuleTile to="/checklists" icon={ClipboardCheck} label="PM Checklists" count={data.counts.checklists} art={<ChecklistBoard className="h-9 w-8" items={3} />} />
              <ModuleTile to="/store-lists" icon={Store} label="Store Lists" count={data.counts.storeLists} />
              <ModuleTile to="/uploads" icon={Images} label="Photos & Videos" count={data.counts.uploads} />
            </motion.div>
          </div>

          {data.equipmentTop.length > 0 && (
            <motion.div variants={item}>
              <Card>
                <CardHeader title="Most-serviced equipment" icon={<Gauge className="h-[18px] w-[18px]" />} />
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.equipmentTop.map((e, i) => {
                    const max = data.equipmentTop[0].count || 1;
                    return (
                      <div key={e.label}>
                        <div className="mb-1.5 flex justify-between text-[13px]"><span className="truncate text-ink">{equipmentLabel(e.label)}</span><span className="font-semibold tabular-nums text-muted">{e.count}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-sunken">
                          <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" initial={{ width: 0 }}
                            animate={{ width: `${(e.count / max) * 100}%` }} transition={{ delay: 0.2 + i * 0.08, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
