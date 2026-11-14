<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" type="image/x-icon" href="images/favicon.ico">
  <title>Megger Test Viewer</title>
  <style>
    /* ── Base ────────────────────────────────────────────────── */
    *,*::before,*::after{box-sizing:border-box}
    :root{
      --viewer-bg:#eef1f7;
      --viewer-panel:#ffffff;
      --viewer-panel-soft:rgba(255,255,255,.82);
      --viewer-text:#172033;
      --viewer-muted:#5d6880;
      --viewer-border:rgba(60,88,145,.14);
      --viewer-shadow:0 18px 50px rgba(26,35,65,.08),0 6px 20px rgba(26,35,65,.06);
      --viewer-rainbow:linear-gradient(90deg,#ff6b6b 0%,#ffb86b 16%,#ffd93d 32%,#4ade80 48%,#38bdf8 64%,#818cf8 82%,#f472b6 100%);
      --viewer-rainbow-soft:linear-gradient(135deg,rgba(255,107,107,.16),rgba(255,217,61,.12) 30%,rgba(56,189,248,.12) 65%,rgba(244,114,182,.14));
    }
    body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:0;color:var(--viewer-text);background:linear-gradient(180deg,#f7f9fd 0%,var(--viewer-bg) 100%);min-height:100vh;position:relative;overflow-x:hidden}
    body::before,
    body::after{content:"";position:fixed;inset:auto;pointer-events:none;z-index:0;filter:blur(48px);opacity:.45}
    body::before{top:-80px;left:-60px;width:260px;height:260px;background:radial-gradient(circle,rgba(255,107,107,.34) 0%,rgba(255,107,107,0) 72%)}
    body::after{right:-70px;top:130px;width:320px;height:320px;background:radial-gradient(circle,rgba(56,189,248,.28) 0%,rgba(244,114,182,0) 72%)}

    /* ── Page wrapper ───────────────────────────────────────── */
    .page-wrapper{max-width:1040px;margin:0 auto;padding:30px 20px 56px;position:relative;z-index:1}

    /* ── Page header ────────────────────────────────────────── */
    .page-header{margin-bottom:24px;padding:22px 24px;border:1px solid rgba(255,255,255,.65);border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.84),rgba(255,255,255,.7));backdrop-filter:blur(18px);box-shadow:0 14px 40px rgba(30,40,80,.06);position:relative;overflow:hidden}
    .page-header::before{content:"";position:absolute;inset:0 auto auto 0;width:100%;height:4px;background:var(--viewer-rainbow)}
    .page-header::after{content:"";position:absolute;right:-70px;bottom:-85px;width:220px;height:220px;background:radial-gradient(circle,rgba(129,140,248,.16) 0%,rgba(129,140,248,0) 70%)}
    .page-header .breadcrumb{font-size:12px;color:var(--viewer-muted);margin-bottom:10px;letter-spacing:.32px;text-transform:uppercase;font-weight:700}
    .page-header .breadcrumb a{color:#0b78d1;text-decoration:none}
    .page-header .breadcrumb a:hover{text-decoration:underline}
    .page-header h1{margin:0;font-size:28px;font-weight:800;color:#0f1f3d;letter-spacing:-.5px;line-height:1.15;position:relative;z-index:1}
    .page-header .sub{font-size:14px;color:var(--viewer-muted);margin-top:10px;max-width:720px;line-height:1.65;position:relative;z-index:1}
    .rainbow-badge{display:inline-flex;align-items:center;gap:8px;margin-right:10px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.76);border:1px solid rgba(129,140,248,.22);font-size:11px;font-weight:800;letter-spacing:.45px;text-transform:uppercase;color:#172033;vertical-align:middle;box-shadow:0 6px 18px rgba(26,35,65,.08)}
    .rainbow-badge::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--viewer-rainbow);box-shadow:0 0 0 3px rgba(255,255,255,.75)}

    /* ── Card ───────────────────────────────────────────────── */
    .card{background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.92));border:1px solid var(--viewer-border);border-radius:24px;box-shadow:var(--viewer-shadow);overflow:hidden;position:relative}
    .card::before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:var(--viewer-rainbow)}

    /* ── Card header bar ────────────────────────────────────── */
    .card-header{display:flex;align-items:center;justify-content:space-between;padding:22px 24px 18px;border-bottom:1px solid rgba(60,88,145,.12);background:linear-gradient(135deg,rgba(255,255,255,.88),rgba(248,250,255,.84));gap:14px;flex-wrap:wrap;position:relative}
    .card-header .header-copy{display:flex;flex-direction:column;gap:6px}
    .card-header .card-title{font-size:16px;font-weight:800;color:#0f1f3d;display:flex;align-items:center;gap:10px}
    .card-header .card-title svg{flex-shrink:0}
    .card-note{font-size:13px;line-height:1.5;color:var(--viewer-muted)}

    /* ── Toolbar ────────────────────────────────────────────── */
    .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border:1px solid transparent;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;line-height:1;transition:background .18s,box-shadow .18s,transform .12s,border-color .18s;white-space:nowrap}
    .btn:active{transform:scale(.97)}
    .btn:hover{transform:translateY(-1px)}
    .btn-primary{background:linear-gradient(135deg,#2563eb 0%,#7c3aed 50%,#ec4899 100%);color:#fff;box-shadow:0 12px 24px rgba(99,102,241,.24)}
    .btn-primary:hover{box-shadow:0 14px 30px rgba(99,102,241,.30)}
    .btn-secondary{background:rgba(255,255,255,.92);color:#243047;border-color:rgba(96,117,168,.26);box-shadow:0 8px 18px rgba(26,35,65,.06)}
    .btn-secondary:hover{background:#ffffff;border-color:rgba(59,130,246,.36)}
    .btn-action{background:rgba(59,130,246,.09);color:#1d4ed8;border-color:rgba(59,130,246,.22)}
    .btn-action:hover{background:rgba(59,130,246,.16)}
    .btn-print{background:rgba(34,197,94,.1);color:#166534;border-color:rgba(34,197,94,.24)}
    .btn-print:hover{background:rgba(34,197,94,.16)}
    .btn-edit{background:rgba(245,158,11,.11);color:#9a5a00;border-color:rgba(245,158,11,.24)}
    .btn-edit:hover{background:rgba(245,158,11,.18)}
    .btn-delete{background:rgba(244,63,94,.09);color:#be123c;border-color:rgba(244,63,94,.2)}
    .btn-delete:hover{background:rgba(244,63,94,.15)}

    /* ── Table wrapper ──────────────────────────────────────── */
    .table-wrap{overflow-x:auto;padding:10px 10px 12px;background:linear-gradient(180deg,rgba(255,255,255,.4),rgba(246,249,255,.72))}
    table{width:100%;border-collapse:separate;border-spacing:0;min-width:560px}
    thead tr{background:transparent}
    th{padding:13px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.9px;color:#44506a;text-align:left;border-bottom:2px solid rgba(59,130,246,.24);white-space:nowrap;background:rgba(245,248,255,.86)}
    th:first-child{border-top-left-radius:16px}
    th:last-child{border-top-right-radius:16px}
    td{padding:14px 14px;font-size:13.5px;color:#1a1a2e;border-bottom:1px solid rgba(86,108,154,.12);vertical-align:middle;background:rgba(255,255,255,.78)}
    tbody tr:last-child td{border-bottom:0}
    tbody tr:hover td{background:#f4f8ff}
    tbody tr:nth-child(even) td{background:#fbfcff}
    tbody tr:nth-child(even):hover td{background:#eef5ff}
    td.actions{white-space:nowrap;display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px}

    /* ── File name cell ─────────────────────────────────────── */
    .file-name{font-weight:800;color:#0f1f3d;display:inline-flex;align-items:center;gap:10px}
    .file-name::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--viewer-rainbow);flex-shrink:0;box-shadow:0 0 0 4px rgba(99,102,241,.08)}
    .date-cell{font-size:12px;color:#6b7280;font-weight:600}

    /* ── Empty state ────────────────────────────────────────── */
    .empty-state{text-align:center;padding:72px 24px;background:var(--viewer-rainbow-soft);border:1px dashed rgba(96,117,168,.22);border-radius:18px;margin:14px}
    .empty-state svg{opacity:.6;margin-bottom:14px}
    .empty-state p{font-size:15px;color:#516079;margin:0;font-weight:700}

    /* ── Row number column ─────────────────────────────────── */
    .row-num{color:#8190a9;font-size:12px;width:36px;text-align:center;font-weight:800}

    /* ── Light-mode input defaults (no !important — theme can override) ── */
    .card input,.card select,.card textarea{background:#fff;color:inherit;border-color:#d1d5db}

    /* ── Responsive ─────────────────────────────────────────── */
    @media (max-width:640px){
      .page-wrapper{padding:16px 12px 32px}
      .page-header{padding:18px 16px;border-radius:20px}
      .page-header h1{font-size:22px}
      .page-header .sub{font-size:13px}
      .card{border-radius:20px}
      .card-header{padding:16px}
      td,th{padding:9px 10px}
      td.actions{flex-direction:column;gap:5px}
      .btn{padding:9px 12px;font-size:12px;justify-content:center}
      .card-note{font-size:12px}
      .rainbow-badge{display:inline-flex;margin:0 0 8px 0}
    }

    /* ── Print ──────────────────────────────────────────────── */
    @media print{
      .page-header,.toolbar,.btn-primary,.card-header{display:none !important}
      body{background:#fff}
      .card{box-shadow:none;border-radius:0}
    }
  </style>
  <link rel="stylesheet" href="hangar-theme.css">
  <link rel="stylesheet" href="responsive.css">
  <style>
  /* ════════════════════════════════════════════════════════════════
     MEGGER VIEWER — THEME-AWARE VISIBILITY OVERRIDES
     This block is intentionally placed AFTER the external theme
     stylesheets so it wins by cascade order at equal specificity.
     ════════════════════════════════════════════════════════════════ */

  /* ── Helpers shared across all dark-background themes ────────── */
  body[data-theme="dark"],
  body[data-theme="futuristic"],
  body[data-theme="emerald"],
  body[data-theme="midnight"] {
    --mv-text:     var(--hg-text,  #e0e0e0);
    --mv-muted:    var(--muted,    #9e9e9e);
    --mv-accent:   var(--accent,   #64b5f6);
    --mv-surface:  var(--hg-surface, rgba(30,30,30,.92));
    --mv-border:   var(--hg-card-border, rgba(255,255,255,.1));
    --mv-inp-bg:   var(--hg-input-bg,  rgba(25,25,25,.7));
    --mv-inp-bd:   var(--hg-input-border, rgba(100,181,246,.2));
  }

  /* ── Light theme (default + sunset) ──────────────────────────── */
  :root{
    --mv-text:    #1a1a2e;
    --mv-muted:   #6b7280;
    --mv-accent:  #0b78d1;
    --mv-surface: #fafbfd;
    --mv-border:  #e5e7eb;
    --mv-inp-bg:  #fff;
    --mv-inp-bd:  #d1d5db;
  }

  /* ══ PAGE HEADER ══════════════════════════════════════════════ */
  body[data-theme="dark"] .page-header,
  body[data-theme="futuristic"] .page-header,
  body[data-theme="emerald"] .page-header,
  body[data-theme="midnight"] .page-header
  { background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02)) !important;border-color:var(--mv-border) !important;box-shadow:0 18px 40px rgba(0,0,0,.18) }

  body[data-theme="dark"] .page-header h1,
  body[data-theme="futuristic"] .page-header h1,
  body[data-theme="emerald"] .page-header h1,
  body[data-theme="midnight"] .page-header h1
  { color: var(--mv-text) !important }

  body[data-theme="dark"] .page-header .sub,
  body[data-theme="futuristic"] .page-header .sub,
  body[data-theme="emerald"] .page-header .sub,
  body[data-theme="midnight"] .page-header .sub
  { color: var(--mv-muted) !important }

  body[data-theme="dark"] .page-header .breadcrumb,
  body[data-theme="futuristic"] .page-header .breadcrumb,
  body[data-theme="emerald"] .page-header .breadcrumb,
  body[data-theme="midnight"] .page-header .breadcrumb
  { color: var(--mv-muted) !important }

  body[data-theme="dark"] .page-header .breadcrumb a,
  body[data-theme="futuristic"] .page-header .breadcrumb a,
  body[data-theme="emerald"] .page-header .breadcrumb a,
  body[data-theme="midnight"] .page-header .breadcrumb a
  { color: var(--mv-accent) !important }

  body[data-theme="dark"] .rainbow-badge,
  body[data-theme="futuristic"] .rainbow-badge,
  body[data-theme="emerald"] .rainbow-badge,
  body[data-theme="midnight"] .rainbow-badge
  { background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:var(--mv-text) !important;box-shadow:none }

  /* ══ CARD HEADER ══════════════════════════════════════════════ */
  body[data-theme="dark"] .card-header,
  body[data-theme="futuristic"] .card-header,
  body[data-theme="emerald"] .card-header,
  body[data-theme="midnight"] .card-header
  { background: var(--mv-surface) !important; border-bottom-color: var(--mv-border) !important }

  body[data-theme="dark"] .card-title,
  body[data-theme="futuristic"] .card-title,
  body[data-theme="emerald"] .card-title,
  body[data-theme="midnight"] .card-title
  { color: var(--mv-text) !important }

  body[data-theme="dark"] .card-note,
  body[data-theme="futuristic"] .card-note,
  body[data-theme="emerald"] .card-note,
  body[data-theme="midnight"] .card-note
  { color: var(--mv-muted) !important }

  /* ══ TABLE ══════════════════════════════════════════════════════ */
  body[data-theme="dark"] thead tr,
  body[data-theme="futuristic"] thead tr,
  body[data-theme="emerald"] thead tr,
  body[data-theme="midnight"] thead tr
  { background: transparent }

  body[data-theme="dark"] th,
  body[data-theme="futuristic"] th,
  body[data-theme="emerald"] th,
  body[data-theme="midnight"] th
  { color: var(--mv-text) !important }

  body[data-theme="dark"] td,
  body[data-theme="futuristic"] td,
  body[data-theme="emerald"] td,
  body[data-theme="midnight"] td
  { color: var(--mv-text) !important }

  body[data-theme="dark"] .file-name,
  body[data-theme="futuristic"] .file-name,
  body[data-theme="emerald"] .file-name,
  body[data-theme="midnight"] .file-name
  { color: var(--mv-text) !important }

  body[data-theme="dark"] .date-cell,
  body[data-theme="futuristic"] .date-cell,
  body[data-theme="emerald"] .date-cell,
  body[data-theme="midnight"] .date-cell
  { color: var(--mv-muted) !important }

  body[data-theme="dark"] .row-num,
  body[data-theme="futuristic"] .row-num,
  body[data-theme="emerald"] .row-num,
  body[data-theme="midnight"] .row-num
  { color: var(--mv-muted) !important }

  body[data-theme="dark"] .empty-state p,
  body[data-theme="futuristic"] .empty-state p,
  body[data-theme="emerald"] .empty-state p,
  body[data-theme="midnight"] .empty-state p
  { color: var(--mv-muted) }

  body[data-theme="dark"] .empty-state,
  body[data-theme="futuristic"] .empty-state,
  body[data-theme="emerald"] .empty-state,
  body[data-theme="midnight"] .empty-state
  { background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.12) }

  /* ══ INPUTS inside card ══════════════════════════════════════ */
  body[data-theme="dark"] .card input,
  body[data-theme="dark"] .card select,
  body[data-theme="dark"] .card textarea,
  body[data-theme="futuristic"] .card input,
  body[data-theme="futuristic"] .card select,
  body[data-theme="futuristic"] .card textarea,
  body[data-theme="emerald"] .card input,
  body[data-theme="emerald"] .card select,
  body[data-theme="emerald"] .card textarea,
  body[data-theme="midnight"] .card input,
  body[data-theme="midnight"] .card select,
  body[data-theme="midnight"] .card textarea
  {
    background: var(--mv-inp-bg) !important;
    color:       var(--mv-text) !important;
    border-color:var(--mv-inp-bd) !important;
  }

  /* ══ ACTION BUTTONS — DARK ══════════════════════════════════ */
  body[data-theme="dark"] .btn-secondary
  { background:rgba(255,255,255,.08);color:#d4d4d4;border-color:rgba(100,181,246,.32) }
  body[data-theme="dark"] .btn-secondary:hover
  { background:rgba(255,255,255,.13) }
  body[data-theme="dark"] .btn-action
  { background:rgba(100,181,246,.13);color:#64b5f6;border-color:rgba(100,181,246,.35) }
  body[data-theme="dark"] .btn-print
  { background:rgba(74,222,128,.1);color:#4ade80;border-color:rgba(74,222,128,.32) }
  body[data-theme="dark"] .btn-edit
  { background:rgba(251,191,36,.1);color:#fbbf24;border-color:rgba(251,191,36,.32) }
  body[data-theme="dark"] .btn-delete
  { background:rgba(248,113,113,.1);color:#f87171;border-color:rgba(248,113,113,.32) }
  body[data-theme="dark"] .btn-primary { color:#fff !important }

  /* ══ ACTION BUTTONS — FUTURISTIC ════════════════════════════ */
  body[data-theme="futuristic"] .btn-secondary
  { background:rgba(0,255,204,.08);color:#00ffcc;border-color:rgba(0,255,204,.3) }
  body[data-theme="futuristic"] .btn-action
  { background:rgba(0,255,204,.1);color:#00ffcc;border-color:rgba(0,255,204,.32) }
  body[data-theme="futuristic"] .btn-print
  { background:rgba(0,255,204,.07);color:#00e8b6;border-color:rgba(0,255,204,.25) }
  body[data-theme="futuristic"] .btn-edit
  { background:rgba(255,0,255,.08);color:#ff80ff;border-color:rgba(255,0,255,.28) }
  body[data-theme="futuristic"] .btn-delete
  { background:rgba(255,80,80,.1);color:#ff9090;border-color:rgba(255,80,80,.32) }

  /* ══ ACTION BUTTONS — EMERALD ═══════════════════════════════ */
  body[data-theme="emerald"] .btn-secondary
  { background:rgba(45,138,78,.12);color:#c8e0c8;border-color:rgba(45,138,78,.32) }
  body[data-theme="emerald"] .btn-action
  { background:rgba(212,166,38,.1);color:#d4a626;border-color:rgba(212,166,38,.32) }
  body[data-theme="emerald"] .btn-print
  { background:rgba(45,138,78,.15);color:#6ee09e;border-color:rgba(45,138,78,.38) }
  body[data-theme="emerald"] .btn-edit
  { background:rgba(212,166,38,.12);color:#d4a626;border-color:rgba(212,166,38,.32) }
  body[data-theme="emerald"] .btn-delete
  { background:rgba(200,70,70,.1);color:#e08888;border-color:rgba(200,70,70,.3) }

  /* ══ ACTION BUTTONS — MIDNIGHT ══════════════════════════════ */
  body[data-theme="midnight"] .btn-secondary
  { background:rgba(179,136,255,.1);color:#d0c0f0;border-color:rgba(179,136,255,.32) }
  body[data-theme="midnight"] .btn-action
  { background:rgba(179,136,255,.12);color:#b388ff;border-color:rgba(179,136,255,.36) }
  body[data-theme="midnight"] .btn-print
  { background:rgba(100,200,150,.1);color:#80dcaa;border-color:rgba(100,200,150,.32) }
  body[data-theme="midnight"] .btn-edit
  { background:rgba(224,64,251,.1);color:#e040fb;border-color:rgba(224,64,251,.28) }
  body[data-theme="midnight"] .btn-delete
  { background:rgba(248,113,113,.1);color:#f87171;border-color:rgba(248,113,113,.3) }

  /* ══ SUNSET THEME (light warm bg) ═══════════════════════════ */
  body[data-theme="sunset"] .page-header h1,
  body[data-theme="sunset"] .card-title  { color:#5a3520 !important }
  body[data-theme="sunset"] .page-header .sub,
  body[data-theme="sunset"] .page-header .breadcrumb { color:#7a6a5a !important }
  body[data-theme="sunset"] .page-header .breadcrumb a { color:#c0623a !important }
  body[data-theme="sunset"] .page-header
  { background:linear-gradient(135deg,rgba(255,252,246,.92),rgba(255,246,238,.88)) !important;border-color:rgba(192,98,58,.14) !important;box-shadow:0 14px 32px rgba(120,60,20,.08) }
  body[data-theme="sunset"] .rainbow-badge
  { background:rgba(255,255,255,.72);color:#5a3520 !important;border-color:rgba(192,98,58,.2) }
  body[data-theme="sunset"] .card-header
  { background:rgba(255,248,240,.95) !important; border-bottom-color:rgba(192,98,58,.15) !important }
  body[data-theme="sunset"] .card-note { color:#7a6a5a !important }
  body[data-theme="sunset"] th  { color:#5a3520 !important }
  body[data-theme="sunset"] td  { color:#4a3a2a !important }
  body[data-theme="sunset"] .file-name { color:#3d2e1e !important }
  body[data-theme="sunset"] .date-cell { color:#8a7a6a !important }
  body[data-theme="sunset"] .row-num   { color:#a09080 !important }
  body[data-theme="sunset"] .empty-state{background:linear-gradient(135deg,rgba(255,248,240,.88),rgba(255,243,236,.92));border-color:rgba(192,98,58,.16)}
  body[data-theme="sunset"] .btn-secondary
  { background:rgba(192,98,58,.07);color:#5a3520;border-color:rgba(192,98,58,.22) }
  body[data-theme="sunset"] .btn-action
  { background:rgba(140,60,20,.08);color:#8b3a18;border-color:rgba(140,60,20,.24) }
  body[data-theme="sunset"] .btn-print
  { background:rgba(34,100,50,.08);color:#1a5c2a;border-color:rgba(34,100,50,.22) }
  body[data-theme="sunset"] .btn-edit
  { background:rgba(180,83,9,.1);color:#7c3d00;border-color:rgba(180,83,9,.28) }
  body[data-theme="sunset"] .btn-delete
  { background:rgba(190,18,60,.07);color:#8b0030;border-color:rgba(190,18,60,.22) }
  </style>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js"></script>
  <script src="firebase-config.js"></script>
  <script src="auth-guard.js"></script>
  <script src="db.js"></script>
</head>
<body>
  <div class="page-wrapper">

    <!-- Page Header -->
    <div class="page-header">
      <div class="breadcrumb"><a href="index.php">Dashboard</a> &rsaquo; Megger Test</div>
      <h1>
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b78d1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Megger Test Files
      </h1>
      <div class="sub"><span class="rainbow-badge">Readable Viewer</span>View, print, and manage insulation resistance test records with clearer spacing, stronger contrast, and easier-to-scan actions.</div>
    </div>

    <!-- Main Card -->
    <div class="card">
      <div class="card-header">
        <div class="header-copy">
          <div class="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b78d1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Saved Records
          </div>
          <div class="card-note">Open a saved file, print a clean report, or jump back into editing from a single list.</div>
        </div>
        <div class="toolbar">
          <button class="btn btn-secondary" onclick="location.reload()">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
          <button class="btn btn-primary" onclick="window.location.href='megger_test_form.php'">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Test
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <div id="file-list"></div>
        <div id="empty-list" class="empty-state" style="display:none">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <p>No saved megger test files found.</p>
        </div>
      </div>
    </div><!-- /.card -->

  </div><!-- /.page-wrapper -->
  <script>
    const STORAGE_KEY = 'megger_test_files_v1';
    let isAdminUser = false;
    // Each file: {name, data, savedAt}
    function normalizeFiles(arr){
      if(!Array.isArray(arr)) return [];
      return arr.map(item => {
        // Many backends wrap the stored object; try common shapes
        if(!item) return null;
        if(item.name && item.data) return item;
        if(item.data && item.data.name) return { name: item.data.name, data: item.data, savedAt: item.savedAt || item.data.createdAt || item.data.savedAt };
        if(item.payload && item.payload.name) return { name: item.payload.name, data: item.payload, savedAt: item.savedAt || item.payload.createdAt };
        if(item.doc && item.doc.data) return { name: item.doc.data.name || item.doc.id, data: item.doc.data, savedAt: item.doc.data.savedAt || item.doc.updatedAt };
        // If it's already the data object (no wrapper), synthesize a name
        if(item.rows || item.company) return { name: item.name || (item.referenceNo?item.referenceNo:'megger_'+(item.date||'unnamed')), data: item, savedAt: item.savedAt || item.createdAt };
        return null;
      }).filter(Boolean);
    }

    function loadFileList() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // fallback to backup key if present
          const backup = localStorage.getItem(STORAGE_KEY+"_backup");
          if(backup) return normalizeFiles(JSON.parse(backup));
          return [];
        }
        const arr = JSON.parse(raw);
        return normalizeFiles(arr);
      } catch(e) { console.error('Failed to load file list', e); return []; }
    }
    function saveFileList(arr) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      try{ localStorage.setItem(STORAGE_KEY+"_backup", JSON.stringify(arr)); }catch(e){}
    }
    async function checkAdminRole() {
      try {
        if (typeof firebase === 'undefined' || !firebase.auth) {
          console.warn('Firebase not initialized yet');
          return false;
        }
        // Wait for auth state to settle - user should be set by now
        return new Promise((resolve) => {
          const unsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
            unsubscribe();
            if (!user) {
              console.warn('No user authenticated');
              resolve(false);
              return;
            }
            try {
              const token = await user.getIdTokenResult(true); // Force refresh
              isAdminUser = token.claims.admin === true;
              console.log('Admin status:', isAdminUser, 'User:', user.email, 'Claims:', token.claims);
              resolve(isAdminUser);
            } catch(e) {
              console.error('Token fetch failed:', e);
              resolve(false);
            }
          });
        });
      } catch(e) {
        console.error('Admin check failed:', e);
        return false;
      }
    }
    async function loadFromFirebase() {
      // load from server if possible
      try {
        const arr = await DB.list(STORAGE_KEY);
        if(Array.isArray(arr) && arr.length>0){
          // normalize server result and store locally
          const norm = normalizeFiles(arr);
          if(norm.length>0) localStorage.setItem(STORAGE_KEY, JSON.stringify(norm));
          return norm.length>0 ? norm : normalizeFiles(arr);
        }
      } catch(e){
        console.warn('Server load failed, falling back to local',e);
      }
      return loadFileList();
    }
    function renderFileList() {
      const files = loadFileList();
      const listDiv = document.getElementById('file-list');
      const emptyDiv = document.getElementById('empty-list');
      if (!files || files.length === 0) {
        listDiv.innerHTML = '';
        emptyDiv.style.display = 'block';
        return;
      }
      emptyDiv.style.display = 'none';
      let html = '<table><thead><tr><th>#</th><th>File Name</th><th>Date Saved</th><th>Actions</th></tr></thead><tbody>';
      files.forEach((f, idx) => {
        let actionButtons =
          `<button class='btn btn-action' onclick='viewFile(${idx})'>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button> ` +
          `<button class='btn btn-print' onclick='printFile(${idx})'>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print</button> ` +
          `<button class='btn btn-edit' onclick='editFile(${idx})'>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>`;
        if (isAdminUser) {
          actionButtons += ` <button class='btn btn-delete' onclick='deleteFile(${idx})'>` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>Delete</button>`;
        }
        const dateStr = f.savedAt ? new Date(f.savedAt).toLocaleString() : '—';
        html += `<tr>` +
          `<td class="row-num">${idx + 1}</td>` +
          `<td><span class="file-name">${escapeHTML(f.name)}</span></td>` +
          `<td><span class="date-cell">${dateStr}</span></td>` +
          `<td class="actions">${actionButtons}</td>` +
          `</tr>`;
      });
      html += '</tbody></table>';
      listDiv.innerHTML = html;
    }
    async function renderFileListAsync() {
      const files = await loadFromFirebase();
      renderFileList();
    }
    function escapeHTML(s) {
      return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    function viewFile(idx) {
      const files = loadFileList();
      const file = files[idx];
      if(!file) return alert('File not found.');
      let rec = file.data || file;
      if(!rec) { console.warn('No data found on file', file); return alert('File has no data.'); }
      if(typeof rec === 'string'){
        try{ rec = JSON.parse(rec); }catch(e){ console.warn('Failed to parse stored JSON string', e); }
      }
      const w = window.open('', '_blank');
      w.document.write(renderPrintable(rec));
      w.document.close();
    }
    function printFile(idx) {
      const files = loadFileList();
      const file = files[idx];
      if(!file) return alert('File not found.');
      let rec = file.data || file;
      if(!rec) { console.warn('No data found on file', file); return alert('File has no data.'); }
      if(typeof rec === 'string'){
        try{ rec = JSON.parse(rec); }catch(e){ console.warn('Failed to parse stored JSON string', e); }
      }
      const html = renderPrintable(rec);
      const blob = new Blob([html],{type:'text/html'});
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
    }
    function editFile(idx) {
      sessionStorage.setItem('megger_edit_idx', idx);
      window.location.href = 'megger_test_form.php';
    }
    async function deleteFile(idx) {
      if (!isAdminUser) {
        alert('Only Admin users can delete files.');
        return;
      }
      const files = loadFileList();
      if (idx < 0 || idx >= files.length) {
        alert('File not found.');
        return;
      }
      const fileName = files[idx].name;
      if (!confirm(`Delete file "${fileName}"? This action cannot be undone.`)) {
        return;
      }
      files.splice(idx, 1);
      saveFileList(files);
      // sync to backend
      try {
          if(files[idx] && files[idx].id) {
              await DB.delete(STORAGE_KEY, files[idx].id);
          } else {
              await fetch('api/bulk.php?collection='+encodeURIComponent(STORAGE_KEY), {
                  method:'POST', headers:{'Content-Type':'application/json'},
                  body: JSON.stringify(files)
              });
          }
      } catch(e){ console.error('Server delete sync failed:', e); }
      alert('File deleted.');
      renderFileList();
    }
    function renderPrintable(r){
      function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      let rowsHtml = '';
      (r.rows||[]).forEach((row,i)=>{
        const rmk = esc(row.remarks);
        const rmkStyle = rmk==='Passed' ? 'color:#006400;font-weight:800' : rmk==='Failed' ? 'color:#8b0000;font-weight:800' : 'font-weight:700';
        rowsHtml += `<tr><td>${esc(row.panel)}</td><td>${esc(row.branch)}</td><td>${esc(row['L1-L2'])}</td><td>${esc(row['L1-L3'])}</td><td>${esc(row['L2-L3'])}</td><td>${esc(row['L1-N'])}</td><td>${esc(row['L2-N'])}</td><td>${esc(row['L3-N'])}</td><td>${esc(row['L1-G'])}</td><td>${esc(row['L2-G'])}</td><td>${esc(row['L3-G'])}</td><td>${esc(row['N-G'])}</td><td>${esc(row.wire)}</td><td style='${rmkStyle}'>${rmk}</td></tr>`;
      });
      const html = `<!doctype html><html><head><meta charset='utf-8'><title>Megger Test Report</title>`+
        `<style>`+
        `@page{size:landscape;margin:12mm}`+
        `*{box-sizing:border-box}`+
        `body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:20px 28px;color:#000000;background:#fff;font-size:13px}`+
        `.report-title{text-align:center;margin-bottom:16px;border-bottom:3px solid #0b63b8;padding-bottom:12px}`+
        `.report-title h2{margin:0 0 4px;font-size:19px;font-weight:800;color:#000000;letter-spacing:.8px;text-transform:uppercase}`+
        `.report-title .subtitle{font-size:12px;color:#000000;font-weight:700;margin-top:2px}`+
        `.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px;padding:11px 14px;border:1.5px solid #aaa;border-radius:5px;background:#f5f7fa}`+
        `.info-grid .info-item{font-size:12.5px;padding:2px 0;color:#000000;font-weight:700}`+
        `.info-grid .info-item strong{color:#000000;font-weight:800;min-width:120px;display:inline-block}`+
        `table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}`+
        `th{background:#0b63b8;color:#ffffff;padding:7px 5px;text-align:center;font-weight:800;font-size:10.5px;border:1px solid #094fa0;letter-spacing:.3px}`+
        `td{border:1px solid #888;padding:5px 4px;text-align:center;color:#000000;font-weight:700}`+
        `tbody tr:nth-child(even) td{background:#f0f4fa}`+
        `.sign-section{display:flex;gap:20px;justify-content:space-between;margin-top:26px;page-break-inside:avoid}`+
        `.sign-block{flex:1;text-align:center}`+
        `.sign-block .line{border-bottom:1.5px solid #000000;height:36px;margin-bottom:6px}`+
        `.sign-block .name{font-weight:800;font-size:13px;color:#000000}`+
        `.sign-block .role{font-size:11px;color:#000000;font-weight:700;margin-top:2px}`+
        `.sign-block .date{font-size:11px;color:#000000;font-weight:700;margin-top:3px}`+
        `.footer{text-align:center;margin-top:18px;font-size:10px;color:#000000;font-weight:700;border-top:1px solid #aaa;padding-top:7px}`+
        `</style></head><body>`+
        `<div class='report-title'><h2>Megger Test Report / Insulation Resistance Test</h2><div class='subtitle'>${esc(r.subject)||'MEGGER TEST RESULT / INSULATION TEST'}</div></div>`+
        `<div class='info-grid'>`+
          `<div class='info-item'><strong>Company:</strong> ${esc(r.company)}</div>`+
          `<div class='info-item'><strong>Reference No:</strong> ${esc(r.referenceNo)}</div>`+
          `<div class='info-item'><strong>Location:</strong> ${esc(r.location)}</div>`+
          `<div class='info-item'><strong>Date:</strong> ${esc(r.date)}</div>`+
          `<div class='info-item'><strong>Test Voltage:</strong> ${esc(r.testVoltage)}</div>`+
          `<div class='info-item'><strong>IR Test Type:</strong> ${esc(r.time)}</div>`+
        `</div>`+
        `<table><thead><tr><th>PANEL</th><th>BRANCH CKT #</th><th>L1-L2</th><th>L1-L3</th><th>L2-L3</th><th>L1-N</th><th>L2-N</th><th>L3-N</th><th>L1-G</th><th>L2-G</th><th>L3-G</th><th>N-G</th><th>WIRE</th><th>REMARKS</th></tr></thead><tbody>${rowsHtml}</tbody></table>`+
        `<div class='sign-section'>`+
          `<div class='sign-block'><div class='line'></div><div class='name'>${esc(r.conductedBy)||'&nbsp;'}</div><div class='role'>Conducted By</div><div class='date'>Date: ${esc(r.date)||''}</div></div>`+
          `<div class='sign-block'><div class='line'></div><div class='name'>${esc(r.witnessedBy)||'&nbsp;'}</div><div class='role'>Witnessed By</div><div class='date'>Date: ${esc(r.date)||''}</div></div>`+
          `<div class='sign-block'><div class='line'></div><div class='name'>${esc(r.verifiedBy)||'&nbsp;'}</div><div class='role'>Verified By</div><div class='date'>Date: ${esc(r.date)||''}</div></div>`+
        `</div>`+
        `<div class='footer'>This document is auto-generated by the EPM Megger Test System</div>`+
        `<scr`+`ipt>window.print()</scr`+`ipt></body></html>`;
      return html;
    }
    document.addEventListener('DOMContentLoaded', async function(){
      // Check admin role (waits for auth state to settle)
      const adminOk = await checkAdminRole();
      console.log('Admin check completed:', adminOk);
      await renderFileListAsync();
    });
  </script>
  <script src="hangar-theme.js"></script>
<script src="theme-loader.js"></script>
</body>
</html>
