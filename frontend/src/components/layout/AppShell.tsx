import {
  Activity, BarChart3, ClipboardCheck, Gauge, Images, LayoutDashboard, LogOut, Menu, Moon, ScrollText, Store, Sun,
  UserCog, Users, Wrench, X, Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { NavLink, useLocation, useNavigate, useOutlet } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { GearCluster } from "@/components/graphics/Gear";
import { Avatar } from "@/components/ui/Surface";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean };
const NAV: Array<{ heading: string; items: NavItem[]; admin?: boolean }> = [
  { heading: "Overview", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/performance", label: "Performance", icon: BarChart3 },
  ] },
  { heading: "Maintenance", items: [
    { to: "/maintenance", label: "PM Records", icon: Wrench },
    { to: "/uploads", label: "Photos & Videos", icon: Images },
  ] },
  { heading: "Tests & Reports", items: [
    { to: "/load-balancing", label: "Load Balancing", icon: Gauge },
    { to: "/megger", label: "Megger Tests", icon: Zap },
    { to: "/checklists", label: "PM Checklists", icon: ClipboardCheck },
    { to: "/store-lists", label: "Store Lists", icon: Store },
  ] },
  { heading: "Administration", admin: true, items: [
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
  ] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  return (
    <div className="flex h-full flex-col bg-[#0b1220] text-slate-300">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 ring-1 ring-white/10">
          <GearCluster size={30} />
        </div>
        <div>
          <div className="font-display text-[17px] font-bold leading-tight text-white">EPM System</div>
          <div className="text-[11px] font-medium tracking-wide text-slate-500">Electrical Preventive Maintenance</div>
        </div>
      </div>
      <div className="hazard mx-5 h-1 rounded-full opacity-80" />
      <nav className="scrollbar-thin mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {NAV.filter((g) => !g.admin || isAdmin).map((group) => (
          <div key={group.heading}>
            <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">{group.heading}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} onClick={onNavigate}
                    className={({ isActive }) => cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive ? "text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100")}>
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-500/5 ring-1 ring-amber-400/25"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                        )}
                        {isActive && <motion.span layoutId="nav-bar" className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-amber-400" />}
                        <item.icon className={cn("relative h-[18px] w-[18px] transition-transform group-hover:scale-110", isActive && "text-amber-300")} />
                        <span className="relative">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 px-5 py-4 text-[11px] text-slate-600">
        <Activity className="mr-1 inline h-3 w-3 text-emerald-500" /> v2.0 · self-hosted
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-surface-2" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user?.fullName ?? user?.email} />
        <div className="hidden text-left sm:block">
          <div className="max-w-[160px] truncate text-sm font-semibold text-ink">{user?.fullName ?? user?.email}</div>
          <div className="text-[11px] capitalize text-muted">{user?.role}</div>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }} className="absolute right-0 z-40 mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-semibold text-ink">{user?.fullName}</div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" onClick={() => { setOpen(false); navigate("/account"); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
              <UserCog className="h-4 w-4 text-muted" /> Account & password
            </button>
            <button role="menuitem" onClick={async () => { setOpen(false); await logout(); toast.success("Signed out"); navigate("/login"); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell() {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-950/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[280px] shadow-2xl" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", stiffness: 360, damping: 36 }}>
              <button className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[264px]">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-6">
          <button className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <motion.button whileTap={{ rotate: 180, scale: 0.9 }} onClick={toggle} className="rounded-xl p-2.5 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </motion.button>
          <UserMenu />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="mx-auto w-full max-w-[1400px]">
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
