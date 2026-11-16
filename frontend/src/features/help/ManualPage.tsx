import {
  AlertTriangle, Archive, BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Gauge, HelpCircle, Images, Info, KeyRound,
  LayoutDashboard, Lightbulb, LogIn, Printer, Search, ShieldCheck, Store, Trash2, UserCog, Users, Wrench, Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { GearCluster } from "@/components/graphics/Gear";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Building blocks ───────────────────────────── */

/** A button / menu label exactly as it appears on screen. */
function Ui({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded-md border border-line bg-surface-2 px-1.5 py-px font-sans text-[0.92em] font-semibold text-ink">{children}</span>;
}

/** A page / path in the app. */
function Path({ children }: { children: ReactNode }) {
  return <code className="rounded bg-sunken px-1.5 py-px font-mono text-[0.88em] text-accent-strong">{children}</code>;
}

const CALLOUTS = {
  tip: { icon: Lightbulb, label: "Tip", cls: "border-ok/30 bg-ok-soft/60", ic: "text-ok" },
  note: { icon: Info, label: "Note", cls: "border-info/30 bg-info-soft/60", ic: "text-info" },
  admin: { icon: ShieldCheck, label: "Administrators only", cls: "border-accent/40 bg-accent-soft/60", ic: "text-accent-strong" },
  warn: { icon: AlertTriangle, label: "Important", cls: "border-danger/30 bg-danger-soft/60", ic: "text-danger" },
} as const;

function Callout({ kind, title, children }: { kind: keyof typeof CALLOUTS; title?: string; children: ReactNode }) {
  const c = CALLOUTS[kind];
  return (
    <div className={cn("manual-avoid my-4 flex gap-3 rounded-xl border p-3.5 text-[14px] leading-relaxed", c.cls)}>
      <c.icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", c.ic)} />
      <div className="min-w-0 text-ink">
        <div className={cn("mb-0.5 text-[11px] font-bold uppercase tracking-wider", c.ic)}>{title ?? c.label}</div>
        {children}
      </div>
    </div>
  );
}

/** Numbered how-to steps. */
function Steps({ title, children }: { title?: string; children: ReactNode[] }) {
  return (
    <div className="manual-avoid my-4">
      {title && <div className="mb-2 text-[13px] font-bold uppercase tracking-wider text-faint">{title}</div>}
      <ol className="space-y-2.5">
        {children.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-ink">{i + 1}</span>
            <div className="min-w-0 pt-0.5 text-[15px] leading-relaxed text-ink">{step}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-7 font-display text-[17px] font-bold text-ink">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="my-3 text-[15px] leading-relaxed text-ink/90">{children}</p>;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="my-3 space-y-1.5 text-[15px] leading-relaxed text-ink/90">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="min-w-0">{it}</span></li>
      ))}
    </ul>
  );
}

function RefTable({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn("manual-avoid my-4 overflow-x-auto rounded-xl border border-line", className)}>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wider text-faint">
            {head.map((h, i) => <th key={i} className="border-b border-line px-3 py-2">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0 align-top">
              {r.map((c, j) => <td key={j} className={cn("px-3 py-2 text-ink", j === 0 && "font-medium")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Yes = () => <CheckCircle2 className="h-4 w-4 text-ok" aria-label="Yes" />;
const No = () => <span className="text-faint" aria-label="No">—</span>;

type ChapterDef = { id: string; title: string; icon: ComponentType<{ className?: string }>; summary: string; admin?: boolean; body: ReactNode };

function Chapter({ n, c }: { n: number; c: ChapterDef }) {
  return (
    <section id={c.id} className="manual-chapter scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <header className="mb-5 flex items-start gap-4 border-b border-line pb-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950">
          <c.icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Chapter {n}</div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            {c.title}
            {c.admin && <span className="ml-2 align-middle rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent-strong">Admin</span>}
          </h2>
          <p className="mt-1 text-[15px] text-muted">{c.summary}</p>
        </div>
      </header>
      {c.body}
    </section>
  );
}

/* ───────────────────────────── Content ───────────────────────────── */

const CHAPTERS: ChapterDef[] = [
  {
    id: "getting-started", title: "Getting started", icon: LogIn,
    summary: "What the system does, how to sign in, and how the screen is laid out.",
    body: <>
      <P>The <b>EPM System</b> (Electrical Preventive Maintenance) is where the team records every inspection, repair and electrical test across all branches: PM records with photo and video evidence, load balancing tests, megger (insulation resistance) tests, PM checklists and store lists. Everything is saved to the company server, so it is the same on every computer and phone.</P>

      <H3>Signing in</H3>
      <Steps>{[
        <>Open the system's address in your browser (Chrome, Edge, Safari or Firefox).</>,
        <>Enter your <b>e-mail</b> and <b>password</b>.</>,
        <>Tick <Ui>Keep me signed in</Ui> on your own device to stay signed in for <b>30 days</b>. Leave it unticked on shared computers: you'll be signed out after <b>7 days</b>, or when you choose <Ui>Sign out</Ui>.</>,
        <>Click <Ui>Sign in</Ui>. You'll land on the Dashboard.</>,
      ]}</Steps>
      <Callout kind="warn">After <b>10 wrong passwords</b> in a row the account is locked for <b>15 minutes</b> to protect it. Wait, then try again, or use <Ui>Forgot password?</Ui>.</Callout>

      <H3>First time? Accepting an invitation</H3>
      <P>An administrator creates your account and e-mails you a <b>set-password link</b>. Open it, choose a password (at least <b>8 characters</b>), and you're in. Invitation links work for <b>72 hours</b>. If yours expired, ask an administrator to send a new one.</P>

      <H3>Forgot your password</H3>
      <Steps>{[
        <>On the sign-in page, click <Ui>Forgot password?</Ui> and enter your e-mail.</>,
        <>Open the e-mail titled <b>Password Reset</b> and click the link. It works for <b>45 minutes</b> and only once.</>,
        <>Enter and confirm your new password. Every other device you were signed in on is signed out for safety.</>,
      ]}</Steps>
      <Callout kind="note">For security, the page always says an e-mail was sent, even if the address isn't registered. If nothing arrives within a few minutes, check your spam folder, then ask an administrator.</Callout>

      <H3>Finding your way around</H3>
      <RefTable head={["Area", "What it's for"]} rows={[
        ["Left sidebar", <>Every section, grouped as <b>Overview</b>, <b>Maintenance</b>, <b>Tests & Reports</b>, <b>Help</b> and (for administrators) <b>Administration</b>. On a phone, tap the <b>☰</b> menu button at the top left.</>],
        ["Moon / sun button", "Switches between light and dark mode. Your choice is remembered on that device."],
        ["Your name (top right)", <><Ui>Account & password</Ui> and <Ui>Sign out</Ui>.</>],
        ["Notifications (top right)", "Short messages confirming saves or explaining errors. Some include an Undo button."],
      ]} />
      <Callout kind="tip">New forms (PM checklist, load balancing, megger test, store list) <b>auto-save a draft</b> on your device as you type. If the browser closes, open <Ui>New</Ui> again and your draft is still there.</Callout>
    </>,
  },
  {
    id: "roles", title: "Roles & permissions", icon: ShieldCheck,
    summary: "There are two roles: User and Admin. This is what each can do.",
    body: <>
      <RefTable head={["Action", "User", "Admin"]} rows={[
        ["View dashboard, PM records, tests, checklists, performance", <Yes />, <Yes />],
        ["Create and edit PM records, load balancing, megger tests, checklists", <Yes />, <Yes />],
        ["Attach photos and videos; move uploads to the trash", <Yes />, <Yes />],
        ["Print and export (CSV)", <Yes />, <Yes />],
        ["View and edit store lists", "Only lists shared with them", "All"],
        ["Create store lists and choose who they're shared with", <No />, <Yes />],
        ["Archive and unarchive records", <No />, <Yes />],
        ["Delete records, view deleted items and restore them", <No />, <Yes />],
        ["Permanently delete files from the trash", <No />, <Yes />],
        ["Manage users and read the audit log", <No />, <Yes />],
      ]} />
      <Callout kind="note">Archived and deleted records are never lost silently. Every archive, unarchive, delete and restore is recorded in the <b>Audit Log</b> with who did it and when.</Callout>
    </>,
  },
  {
    id: "dashboard", title: "Dashboard", icon: LayoutDashboard,
    summary: "Your at-a-glance view of maintenance status.",
    body: <>
      <Bullets items={[
        <><b>Key figures:</b> active <b>PM records</b>, <b>Completed this month</b>, <b>Due in 7 days</b> and <b>Overdue</b>. Click any card to open the matching filtered list.</>,
        <><b>Maintenance activity:</b> records performed per month over the last 12 months.</>,
        <><b>Equipment status</b> and <b>Most-serviced equipment</b> charts.</>,
        <><b>Coming up</b> (next scheduled maintenance) and <b>Recently logged</b> (latest entries).</>,
        <>Shortcut buttons: <Ui>New PM record</Ui> and <Ui>Load test</Ui>, plus totals for every module.</>,
      ]} />
      <Callout kind="note">Archived records are not counted as overdue or due soon, and are not in the active totals. They still appear in the monthly activity chart, because the work was done.</Callout>
    </>,
  },
  {
    id: "pm-records", title: "PM records", icon: Wrench,
    summary: "Log every inspection, repair and replacement, with evidence.",
    body: <>
      <P>Open <b>PM Records</b> in the sidebar (<Path>/maintenance</Path>).</P>
      <H3>Recording maintenance</H3>
      <Steps>{[
        <>Click <Ui>New record</Ui>.</>,
        <>Fill in the <b>branch</b> (name and code), <b>location</b>, <b>equipment</b> and a clear description of the <b>task</b> (required).</>,
        <>Choose a <b>status</b>, e.g. <i>OK, Repaired, Replaced, Requires Follow-up, Inspected, Serviced, Completed</i>.</>,
        <>Under <b>Performed by</b>, pick <b>1 to 4 electricians / technicians</b>. A crew of 2–4 people counts as one team on the Performance page.</>,
        <>Enter <b>Verified by</b>, the <b>Performed on</b> date (defaults to today), and a <b>Next due</b> date if the equipment needs a follow-up.</>,
        <>Add notes if needed, then save.</>,
      ]}</Steps>
      <Callout kind="tip">Always set <b>Next due</b> for recurring maintenance. That's what drives the Overdue and Due-soon alerts on the Dashboard.</Callout>

      <H3>Finding records</H3>
      <Bullets items={[
        <><b>Search</b> matches task, branch, equipment, technician, verifier and notes.</>,
        <>Filter by <b>status</b> and <b>equipment</b>, and sort by newest, oldest, next due, recently logged or branch A–Z.</>,
        <>The <Ui>All</Ui> / <Ui>Overdue</Ui> / <Ui>Due ≤ 7 days</Ui> / <Ui>Due ≤ 30 days</Ui> tabs focus on what needs attention.</>,
        <>Use <b>Quick range</b> or pick from/to dates to limit the period.</>,
        <>Click any row to see the full record with its photos and videos.</>,
      ]} />

      <H3>Row actions</H3>
      <RefTable head={["Button", "What it does"]} rows={[
        ["View (eye)", "Opens the full record, including attachments."],
        ["Edit (pencil)", "Change any field."],
        ["Attach (upload arrow)", "Add photos or videos as evidence (see Chapter 5)."],
        ["Archive (box) — admin", "Moves the record to the Archive (see Chapter 11)."],
        ["Delete (bin) — admin", "Moves the record to deleted items. An admin can restore it."],
      ]} />

      <H3>Export and print</H3>
      <P><Ui>Export CSV</Ui> downloads the records matching your current filters, ready for Excel. <Ui>Print</Ui> produces a landscape report of the same list (up to 500 records, so narrow the filters for longer periods).</P>
    </>,
  },
  {
    id: "uploads", title: "Photos & videos", icon: Images,
    summary: "Evidence attached to maintenance records.",
    body: <>
      <Steps title="Attaching files to a record">{[
        <>In <b>PM Records</b>, click the <b>upload</b> icon on the record (or <Ui>Attach files</Ui> inside it).</>,
        <>Choose or drag in photos or videos. On a phone you can take a photo directly.</>,
        <>Wait for each progress bar to finish before closing.</>,
      ]}</Steps>
      <RefTable head={["Allowed", "Details"]} rows={[
        ["Photos", "JPG, JPEG, PNG, GIF, WEBP"],
        ["Videos", "MP4, MOV, WEBM, AVI, MKV"],
        ["Maximum size", "200 MB per file"],
      ]} />
      <Callout kind="note">Each file is checked against its type. A file that has been renamed to look like a photo is rejected.</Callout>
      <H3>The gallery</H3>
      <Bullets items={[
        <><b>Photos & Videos</b> in the sidebar shows every attachment. Filter by <Ui>Photos</Ui> or <Ui>Videos</Ui> and search by file name, branch or task.</>,
        <>Click a thumbnail to view it full screen and step through with the arrows. You can also download it from there.</>,
        <>Select files and click <Ui>Move to trash</Ui>. The <Ui>Trash</Ui> tab lets anyone <Ui>Restore</Ui> them.</>,
        <><b>Admins</b> can <Ui>Delete forever</Ui> from the trash. This removes the file from the server and cannot be undone.</>,
      ]} />
    </>,
  },
  {
    id: "performance", title: "Performance", icon: BarChart3,
    summary: "Who completed the most maintenance: teams and individuals.",
    body: <>
      <Bullets items={[
        <><b>Top team</b> and <b>Top Electrician / Technician</b> podiums show the top three.</>,
        <>The <b>By team</b> and <b>By Electrician / Technician</b> charts switch between <Ui>Bar</Ui> and <Ui>Pie</Ui>. The full ranking is listed underneath.</>,
        <>Use the <b>date range</b> to compare periods, e.g. this month or this year.</>,
        <><Ui>Add</Ui> another technician by name if they aren't in the standard list.</>,
      ]} />
      <Callout kind="note">A crew of 2–4 people counts as one team, regardless of name order. Each person is also credited individually for every record they worked on, whether solo or in a crew. Archived records still count here.</Callout>
      <P><Ui>Print</Ui> produces a one-page summary, including the podium bars and charts.</P>
    </>,
  },
  {
    id: "load-balancing", title: "Load balancing", icon: Gauge,
    summary: "Measure branch circuits, balance the phases, and run a full load test.",
    body: <>
      <Steps title="Creating a load balancing test">{[
        <>Open <b>Load Balancing</b> and click <Ui>New</Ui>.</>,
        <>Fill in <b>Site & panel</b>: company, branch code, location, panel board, date/time, MCB capacity, main voltage and wire size.</>,
        <>Under <b>Power system configuration</b>, choose the <b>system</b> and enter the voltages it asks for. Per-line voltages are optional; when left blank, the main V(L-L) or V(L-N) is used.</>,
        <>Add each <b>circuit load</b>: a name (e.g. <i>#1</i> or <i>Lighting</i>), the current in amps, and its phase. Click <Ui>Add</Ui>.</>,
        <>Watch the <b>Live summary</b>: phase bars, total load, average, maximum imbalance and kVA.</>,
        <>Click <Ui>Save record</Ui> and give it a file name (default <i>LB_YYYY-MM-DD</i>).</>,
      ]}</Steps>

      <H3>Systems</H3>
      <RefTable head={["System", "Loads are entered on"]} rows={[
        ["Single Phase (Line-to-Neutral)", "L1-N, using V(L-N)"],
        ["Single Phase (Line-to-Line / Combined)", "L1-L2, using V(L-L)"],
        ["Single Phase (Line-to-Line / Split)", "L1 or L2, using the phase voltage"],
        ["Three Phase (Wye / Line-to-Neutral)", "AN, BN, CN, plus a measured neutral N"],
        ["Three Phase (Delta / Line-to-Line)", "AB (L1-L2), CA (L1-L3), BC (L2-L3)"],
      ]} />

      <H3>Three-phase loads (motors, ACCUs)</H3>
      <P>On the two three-phase systems, choose <Ui>3-Phase load</Ui> in the phase list and enter the current of each line. The load is added to all three phases at once, and the balancing suggestions never move it.</P>

      <H3>How kVA is calculated</H3>
      <RefTable head={["System", "Formula"]} rows={[
        ["Wye", <>Each phase: <b>I × its own V(L-N) ÷ 1000</b>, i.e. (I<sub>A</sub>×V L1-N + I<sub>B</sub>×V L2-N + I<sub>C</sub>×V L3-N) ÷ 1000. The neutral current has no kVA.</>],
        ["Delta", <>(I L1-L2 × V L1-L2 + I L1-L3 × V L1-L3 + I L2-L3 × V L2-L3) ÷ 1000</>],
        ["Single phase", <>V × I ÷ 1000, using the system's voltage</>],
      ]} />

      <H3>Balancing suggestions</H3>
      <P>The system proposes single-load moves from the heaviest phase to the lightest that reduce the imbalance. <Ui>Apply first</Ui> moves the top suggestion for you. Aim for an imbalance below <b>10%</b> (green). <b>10–20%</b> shows amber and <b>above 20%</b> red.</P>

      <H3>Full load test</H3>
      <P>Switch to the <Ui>Full load test</Ui> tab, enter the nameplate kW, the measured voltages, currents and power factors (blank = 1). The power per phase, the total and the <b>% of nameplate</b> are calculated as you type.</P>

      <H3>Importing loads from a spreadsheet</H3>
      <P><Ui>Import CSV</Ui> reads columns <Path>name,value,phase</Path>. For three-phase loads, use <Path>name,value,3PH,ia,ib,ic</Path>. <Ui>Export</Ui> writes the same format, so it's easiest to export once and use that as your template.</P>
      <Callout kind="tip"><Ui>Save as new</Ui> copies an existing test under a new file name. That's handy for re-testing the same panel next month.</Callout>
    </>,
  },
  {
    id: "megger", title: "Megger / insulation tests", icon: Zap,
    summary: "Record insulation resistance (IR) readings in MΩ; failures are flagged automatically.",
    body: <>
      <Steps>{[
        <>Open <b>Megger Tests</b> and click <Ui>New</Ui>.</>,
        <>Fill in <b>Test details</b>: company, location, date, reference no., IR test type, test voltage and <b>circuit type</b>.</>,
        <>For each panel/branch circuit, enter the readings in <b>MΩ</b> and choose the wire size. Use <Ui>Add row</Ui> for more circuits.</>,
        <>Fill in the signatories and click <Ui>Save test</Ui>.</>,
      ]}</Steps>
      <Callout kind="warn" title="Pass / fail rule">Any applicable reading <b>below 350 MΩ</b> marks the circuit <b>Failed</b> and highlights the reading in red. Otherwise it's <b>Passed</b>. You can type over the remark to add your own.</Callout>
      <RefTable head={["Circuit type", "Readings that apply"]} rows={[
        ["Three Phase Wye", "All: L1-L2, L1-L3, L2-L3, L1-N, L2-N, L3-N, L1-G, L2-G, L3-G, N-G"],
        ["Three Phase Delta", "L1-L2, L1-L3, L2-L3, L1-G, L2-G, L3-G (no neutral)"],
        ["Single phase L-L", "L1-L2, L1-G, L2-G"],
        ["Single phase L-N", "L1-N, L1-G, N-G"],
      ]} />
      <P>Readings that don't apply are greyed out and ignored. <Ui>CSV</Ui> downloads the readings for Excel.</P>
    </>,
  },
  {
    id: "checklists", title: "PM checklists", icon: ClipboardCheck,
    summary: "Walk through a branch's panel boards, lighting, outlets, AC, FDAS and CCTV in one form.",
    body: <>
      <Steps>{[
        <>Open <b>PM Checklists</b> and click <Ui>New</Ui>.</>,
        <>Enter the <b>branch name</b> and <b>date</b> (both required), plus code, location and who conducted it. A reference number is generated for you.</>,
        <>For each item, mark <b>OK</b>, <b>Not OK</b> or <b>N/A</b>, then write the remarks / work done and recommendations.</>,
        <>Use <b>+</b> / <b>−</b> on a category to add or remove items.</>,
        <>Complete <b>Sign-off</b> (conducted by, witnessed by, store manager, store representative and overall recommendations) and click <Ui>Save checklist</Ui>.</>,
      ]}</Steps>
      <P>The <b>Progress</b> panel shows how much is done and how many items are OK, Not OK or N/A. Not-OK items are highlighted so nothing is missed.</P>
    </>,
  },
  {
    id: "store-lists", title: "Store lists", icon: Store,
    summary: "Monthly snapshots of the branches summary, organised by area.",
    body: <>
      <Callout kind="admin">Only administrators can see and create store lists. An administrator can <b>share</b> a list with chosen users, who can then open and edit that list (but not create new ones, share or delete).</Callout>
      <Steps title="Building a store list (admin)">{[
        <>Open <b>Store Lists</b> and click <Ui>New</Ui>. The standard areas are already there.</>,
        <>In each area, fill in a row per store: PL code, branch code and name, SQM, <b>trade name</b>, company, last PM date and conducted by. Use <Ui>Row</Ui> to add rows.</>,
        <>Set <b>Count as</b> to <b>Main</b> or <b>Sat</b> (satellite). Numbering restarts in each area.</>,
        <>Tick <b>No redm.</b> for stores that shouldn't count towards redemption.</>,
        <>Add a new area with <Ui>Add area</Ui> (e.g. <i>NORTH 7</i>), or remove one with <Ui>Area</Ui>.</>,
        <>Save, giving it a name such as <i>Complete Store List - March 2026</i>.</>,
      ]}</Steps>
      <P>Brand columns (TW, FH, Gotcha, Austin, Adams, Jacks) fill in <b>automatically</b> from known trade names. For other trade names, type them yourself. The totals at the top show <b>with redemption</b>, <b>main</b>, <b>satellite</b>, <b>areas</b> and <b>stores listed</b>.</P>
      <Steps title="Sharing a list (admin)">{[
        <>Click the <b>share</b> icon on the list (or <Ui>Share</Ui> inside it).</>,
        <>Tick the users who should have access, then click <Ui>Save sharing</Ui>.</>,
        <>To stop sharing, untick them. A list with nobody ticked is <b>Admins only</b>.</>,
      ]}</Steps>
    </>,
  },
  {
    id: "archive", title: "The archive", icon: Archive,
    summary: "Close out finished records without deleting them. This works the same in PM Records, Load Balancing, Megger Tests and PM Checklists.",
    body: <>
      <P>Archiving keeps the working lists focused on current work. An archived record is <b>not deleted</b>: it stays viewable, printable and part of history. It just leaves the active list.</P>
      <RefTable head={["", "Active", "Archived"]} rows={[
        ["Shown in the main list", <Yes />, <>In the <Ui>Archive</Ui> tab</>],
        ["Can be edited / attach files", <Yes />, <>No: read-only</>],
        ["Counted as overdue / due soon, dashboard totals", <Yes />, <No />],
        ["Monthly activity chart, Performance", <Yes />, <Yes />],
        ["View and print", <Yes />, <Yes />],
      ]} />
      <Callout kind="admin">Archiving and unarchiving are done by administrators. Everyone can open the <Ui>Archive</Ui> tab and view archived records.</Callout>
      <H3>Three ways to archive</H3>
      <Bullets items={[
        <><b>One record:</b> click the <b>archive</b> (box) icon on its row. A notification offers <Ui>Undo</Ui>.</>,
        <><b>Several records:</b> tick the checkboxes on the left (the header box selects the whole page). A bar appears at the bottom with <Ui>Archive…</Ui>.</>,
        <><b>Everything before a date:</b> click <Ui>Archive…</Ui> at the top of the page and choose <b>By date</b>. The default is 1 January this year, i.e. all previous years. Undated records use the day they were created.</>,
      ]} />
      <Steps title="Confirming">{[
        <>Check the count. For a date cutoff, it shows exactly how many records will move before anything changes.</>,
        <>Optionally give a <b>reason</b>, e.g. <i>Year-end close-out</i>. It's saved on each record and in the audit log.</>,
        <>Click <Ui>Archive N records</Ui>.</>,
      ]}</Steps>
      <H3>Bringing a record back</H3>
      <P>Open the <Ui>Archive</Ui> tab and click the <b>unarchive</b> icon on a row, tick several and use <Ui>Unarchive</Ui> in the bottom bar, or open the record and click <Ui>Unarchive</Ui>. It returns to the active list and becomes editable again.</P>
    </>,
  },
  {
    id: "deleted", title: "Deleted items", icon: Trash2, admin: true,
    summary: "Nothing is lost by accident: deleted records can be restored.",
    body: <>
      <P>When an administrator deletes a record, it's moved out of sight, not erased. To find it, tick <Ui>Show deleted records</Ui> (PM Records) or <Ui>Deleted</Ui> (other lists), then click <Ui>Restore</Ui> on the row.</P>
      <Callout kind="note">A deleted record that was archived goes back to the Archive when restored.</Callout>
      <Callout kind="warn">The only permanent action in the system is <Ui>Delete forever</Ui> on files in the Photos & Videos trash.</Callout>
    </>,
  },
  {
    id: "printing", title: "Printing & exporting", icon: Printer,
    summary: "Professional printouts of every report, and spreadsheet exports.",
    body: <>
      <RefTable head={["Where", "What you get"]} rows={[
        ["PM Records → Print / Export CSV", "Landscape list report of the current filters / spreadsheet"],
        ["Load balancing → Print", "Signed test report with the loads table, kVA and summary"],
        ["Megger test → Print / CSV", "IR test report with pass/fail per circuit / readings spreadsheet"],
        ["PM checklist → Print", "Branch checklist with findings and sign-off"],
        ["Store list → Print", "Branches summary by area"],
        ["Performance → Print", "One-page performance summary with charts"],
        ["This manual → Print manual", "The full manual as a booklet"],
      ]} />
      <Steps title="For the best printout">{[
        <>Click <Ui>Print</Ui>. The browser's print window opens.</>,
        <>Choose your printer, or <b>Save as PDF</b> to e-mail it.</>,
        <>Use <b>A4</b> paper. Reports that need landscape set it themselves.</>,
        <>If colours or bars look missing, open <b>More settings</b> and tick <b>Background graphics</b>.</>,
      ]}</Steps>
      <Callout kind="tip">You can print a test while it's still a draft. The printout uses what's on screen.</Callout>
    </>,
  },
  {
    id: "account", title: "Your account", icon: UserCog,
    summary: "Update your name and change your password.",
    body: <>
      <Steps>{[
        <>Click your name at the top right, then <Ui>Account & password</Ui>.</>,
        <>Under <b>Profile</b>, update your full name and click <Ui>Save</Ui>. Your e-mail can only be changed by an administrator.</>,
        <>Under <b>Change password</b>, enter your current password and the new one twice (at least 8 characters), then click <Ui>Update password</Ui>.</>,
      ]}</Steps>
      <Callout kind="tip">Use a passphrase you don't use anywhere else, and never share your account. Every change is recorded under your name.</Callout>
    </>,
  },
  {
    id: "administration", title: "Administration", icon: Users, admin: true,
    summary: "Managing who can use the system, and reviewing activity.",
    body: <>
      <H3>Adding a user</H3>
      <Steps>{[
        <>Open <b>Users</b> and click <Ui>Add user</Ui>.</>,
        <>Enter the full name and e-mail, and choose the role: <b>User</b> (create and edit records) or <b>Admin</b> (also delete, archive and manage users).</>,
        <>Choose how they get a password. <b>E-mail them a set-password link</b> is recommended. Alternatively, set an initial password and share it securely.</>,
        <>Click <Ui>Create user</Ui>. If e-mail isn't configured, the system shows the link for you to <Ui>Copy</Ui> and send.</>,
      ]}</Steps>
      <RefTable head={["Status", "Meaning", "What you can do"]} rows={[
        ["Invite pending", "Hasn't set a password yet", <><Ui>Send invite</Ui> again (links last 72 hours)</>],
        ["Active", "Can sign in", <><Ui>Reset link</Ui> e-mails a password-reset link</>],
        ["Deactivated", "Signed out everywhere; can't sign in", <><Ui>Reactivate</Ui></>],
      ]} />
      <Callout kind="note">Change a role with the dropdown in the user's row. You can't change your own role or deactivate yourself, so the system always keeps an administrator.</Callout>
      <H3>Audit log</H3>
      <P><b>Audit Log</b> lists sign-ins, failed sign-ins, and every create, update, delete, restore, archive and sharing change, newest first, with the user and IP address. Filter by area (Authentication, User management, PM records, Load balancing and so on) to investigate a question such as <i>"who deleted this record?"</i>.</P>
    </>,
  },
  {
    id: "troubleshooting", title: "Troubleshooting & FAQ", icon: HelpCircle,
    summary: "Quick answers to common questions.",
    body: <>
      <RefTable head={["Situation", "What to do"]} rows={[
        [<>“Couldn't load this list”</>, <>Click <Ui>Retry</Ui>. If it persists, the server may be updating. Tell your administrator (they may need to run the database update).</>],
        ["I can't edit a record / the fields are greyed out", <>It's <b>archived</b>. Look for the <i>Archived · read-only</i> notice. Ask an administrator to unarchive it.</>],
        ["I can't see Store Lists", "Store lists are private to administrators unless one is shared with you. Ask an administrator."],
        ["A record disappeared from the list", <>It may have been archived (check the <Ui>Archive</Ui> tab) or deleted (an administrator can restore it).</>],
        ["I was signed out unexpectedly", <>Sessions end after 7 days (30 with <i>Keep me signed in</i>), or when your password is changed. Sign in again.</>],
        ["My upload was rejected", "Check the file type and size (200 MB maximum). Photos from phones are usually JPG or HEIC; set the camera to JPG (“Most compatible”) if needed."],
        ["I lost what I was typing", <>New forms keep a draft on this device. Open <Ui>New</Ui> again on the same browser.</>],
        ["The printout has no colours", <>Tick <b>Background graphics</b> in the print window (Chapter 13).</>],
        ["Locked out after wrong passwords", <>Wait 15 minutes, or use <Ui>Forgot password?</Ui>.</>],
      ]} />
    </>,
  },
  {
    id: "glossary", title: "Glossary", icon: BookOpen,
    summary: "Terms used throughout the system.",
    body: <>
      <RefTable head={["Term", "Meaning"]} rows={[
        ["PM", "Preventive Maintenance: scheduled inspection and servicing to prevent failures."],
        ["Next due", "The date the equipment should next be serviced. Drives the overdue alerts."],
        ["Load balancing", "Spreading circuit loads evenly across phases so no phase is overloaded."],
        ["Imbalance %", "How far the most-loaded phase is from the average. Lower is better."],
        ["kVA", "Apparent power in kilovolt-amperes (V × I ÷ 1000)."],
        ["Wye (Y)", "Three-phase system with a neutral. Loads are measured line-to-neutral."],
        ["Delta (Δ)", "Three-phase system without a neutral. Loads are measured line-to-line."],
        ["Megger / IR test", "Insulation resistance test in megaohms (MΩ). A pass needs ≥ 350 MΩ here."],
        ["Main / Sat", "Main branch / satellite branch in the store list counts."],
        ["Redemption", "Branches with a redemption counter. Excluded per store with No redm."],
        ["Archive", "Closed-out, read-only records kept for history (Chapter 11)."],
        ["Audit log", "The permanent record of who did what, and when."],
      ]} />
    </>,
  },
];

/* ───────────────────────────── Page ───────────────────────────── */

const EDITION = "November 2026";

export function ManualPage() {
  const [active, setActive] = useState(CHAPTERS[0].id);
  const [filter, setFilter] = useState("");

  // Highlight the chapter currently on screen.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    CHAPTERS.forEach((c) => { const el = document.getElementById(c.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const toc = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return CHAPTERS.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => !q || `${c.title} ${c.summary}`.toLowerCase().includes(q));
  }, [filter]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="manual print-sheet">
      {/* ── Printed cover + contents (print only) ── */}
      <div className="manual-cover hidden print:block">
        <div className="flex items-center gap-3">
          <GearCluster size={44} />
          <div>
            <div className="text-[13px] font-bold uppercase tracking-[0.2em] text-slate-500">EPM System</div>
            <div className="text-[11px] text-slate-500">Electrical Preventive Maintenance</div>
          </div>
        </div>
        <div className="mt-[30mm] h-1.5 w-24 rounded-full bg-amber-400" />
        <h1 className="mt-5 font-display text-[34pt] font-bold leading-tight text-slate-900">User Manual</h1>
        <p className="mt-2 text-[13pt] text-slate-600">The complete guide to recording, testing and reporting electrical preventive maintenance.</p>
        <p className="mt-6 text-[10pt] text-slate-500">Edition: {EDITION}</p>
        <div className="mt-[22mm]">
          <div className="mb-3 text-[10pt] font-bold uppercase tracking-[0.16em] text-slate-500">Contents</div>
          <ol className="columns-2 gap-10 text-[11pt] text-slate-800">
            {CHAPTERS.map((c, i) => (
              <li key={c.id} className="mb-1.5 flex gap-2 break-inside-avoid">
                <span className="w-6 shrink-0 font-bold tabular-nums text-amber-600">{i + 1}.</span>
                <span>{c.title}{c.admin ? " (admin)" : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ── On-screen hero ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="blueprint relative mb-8 overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card print:hidden sm:p-9">
        <div className="hazard absolute inset-x-0 top-0 h-1.5 opacity-80" />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-accent-strong">
              <BookOpen className="h-3.5 w-3.5" /> User Manual · {EDITION}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">How to use the EPM System</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Step-by-step instructions for every part of the system, from signing in and logging maintenance to load balancing, megger tests, checklists, store lists, the archive and administration.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print manual</Button>
              <Button variant="secondary" icon={<LogIn className="h-4 w-4" />} onClick={() => jump("getting-started")}>Start reading</Button>
            </div>
          </div>
          <motion.div className="hidden sm:block" animate={{ rotate: [0, 6, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}>
            <div className="grid h-36 w-36 place-items-center rounded-[2rem] bg-[#0b1220] shadow-pop ring-1 ring-white/10">
              <GearCluster size={92} />
            </div>
          </motion.div>
        </div>
        {/* Quick links */}
        <div className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["pm-records", "Log maintenance", Wrench], ["load-balancing", "Run a load test", Gauge],
            ["archive", "Archive old records", Archive], ["troubleshooting", "Something's wrong", KeyRound],
          ].map(([id, label, Icon]) => {
            const I = Icon as ComponentType<{ className?: string }>;
            return (
              <button key={id as string} onClick={() => jump(id as string)}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-left text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent-strong transition group-hover:scale-110"><I className="h-4 w-4" /></span>
                {label as string}
              </button>
            );
          })}
        </div>
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        {/* ── Table of contents ── */}
        <aside className="print:hidden lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-surface p-3 shadow-card">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a topic…" className="h-9 pl-9 text-[13px]" aria-label="Find a topic" />
            </div>
            <nav className="scrollbar-thin max-h-[calc(100vh-200px)] overflow-y-auto" aria-label="Manual contents">
              <ol className="space-y-0.5">
                {toc.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => jump(c.id)}
                      className={cn("relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                        active === c.id ? "text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                      {active === c.id && <motion.span layoutId="manual-toc" className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-accent/30" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <span className="relative w-5 shrink-0 text-right text-[11px] font-bold tabular-nums text-faint">{c.n}</span>
                      <c.icon className={cn("relative h-4 w-4 shrink-0", active === c.id ? "text-accent-strong" : "text-faint")} />
                      <span className="relative truncate">{c.title}</span>
                    </button>
                  </li>
                ))}
                {toc.length === 0 && <li className="px-2.5 py-3 text-[13px] text-muted">No topics match.</li>}
              </ol>
            </nav>
          </div>
        </aside>

        {/* ── Chapters ── */}
        <div className="min-w-0 space-y-8">
          {CHAPTERS.map((c, i) => <Chapter key={c.id} n={i + 1} c={c} />)}
          <p className="pb-4 text-center text-[13px] text-faint print:hidden">
            End of manual · Still stuck? Ask your system administrator. <button className="font-semibold text-accent-strong hover:underline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button>
          </p>
        </div>
      </div>
    </div>
  );
}
