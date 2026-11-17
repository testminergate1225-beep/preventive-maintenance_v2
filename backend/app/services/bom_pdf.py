"""Bill of Materials → PDF (A4, official layout). One design is used for printing, downloading
and the e-mailed link, so what the store receives is exactly what the team sees.

Uses fpdf2's built-in Helvetica (no font files to ship), so text is mapped to Latin-1.
"""

from datetime import datetime
from pathlib import Path

from fpdf import FPDF

from app.core.config import get_settings
from app.models import BOM_FINAL, Bom

NAVY = (15, 23, 42)
INK = (15, 23, 42)
MUTED = (100, 116, 139)
LINE = (203, 213, 225)
SOFT = (241, 245, 249)
AMBER = (245, 158, 11)
AMBER_SOFT = (254, 243, 199)
RED = (185, 28, 28)

_REPLACE = {
    "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "*", "›": ">", "→": "->",
    "₱": "PHP ", "Ω": "Ohm", "≤": "<=", "≥": ">=", "×": "x", " ": " ",
}


def _t(v: object) -> str:
    """Make any text safe for the core (Latin-1) fonts."""
    s = "" if v is None else str(v)
    for a, b in _REPLACE.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def _date(d) -> str:
    return d.strftime("%d %b %Y") if d else "-"


def _money(v: float | None) -> str:
    return "" if v is None else f"{v:,.2f}"


def _qty(v: float) -> str:
    return f"{v:,.2f}".rstrip("0").rstrip(".")


class _BomPDF(FPDF):
    def __init__(self, bom: Bom, generated: datetime):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.bom = bom
        self.generated = generated
        self.set_margins(15, 15, 15)
        self.set_auto_page_break(auto=True, margin=20)
        self.set_title(_t(f"Bill of Materials {bom.bom_number}"))
        self.set_author("Preventive Maintenance")
        self.set_creator(get_settings().app_name)

    @property
    def draft(self) -> bool:
        return self.bom.status != BOM_FINAL

    def header(self):
        if self.draft:  # watermark behind the page content
            with self.rotation(35, self.w / 2, self.h / 2):
                self.set_font("Helvetica", "B", 110)
                self.set_text_color(226, 232, 240)
                self.text(self.w / 2 - 62, self.h / 2 + 15, "DRAFT")
        # Navy band
        self.set_fill_color(*NAVY)
        self.rect(0, 0, self.w, 26, style="F")
        self.set_xy(15, 7)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 19)
        self.cell(0, 8, "BILL OF MATERIALS")
        self.set_xy(15, 15.5)
        self.set_font("Helvetica", "", 8.5)
        self.set_text_color(148, 163, 184)
        self.cell(0, 5, _t("Electrical Preventive Maintenance - materials required after PM inspection"))
        # Number + status on the right
        self.set_xy(self.w - 85, 7)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(255, 255, 255)
        self.cell(70, 7, _t(self.bom.bom_number), align="R")
        self.set_xy(self.w - 85, 15)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*(AMBER if not self.draft else (148, 163, 184)))
        label = f"REVISION {self.bom.revision}  |  FINAL" if not self.draft else (
            f"DRAFT (after revision {self.bom.revision})" if self.bom.revision else "DRAFT - NOT YET ISSUED")
        self.cell(70, 5, label, align="R")
        # Hazard stripe
        y = 26
        self.set_fill_color(*AMBER)
        self.rect(0, y, self.w, 2.2, style="F")
        self.set_fill_color(*NAVY)
        x = -4.0
        while x < self.w:
            self.polygon([(x, y + 2.2), (x + 2.2, y), (x + 4.4, y), (x + 2.2, y + 2.2)], style="F")
            x += 8.8
        self.set_y(36)
        self.set_text_color(*INK)

    def footer(self):
        self.set_y(-13)
        self.set_draw_color(*LINE)
        self.line(15, self.get_y() - 2, self.w - 15, self.get_y() - 2)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, _t(f"{self.bom.bom_number}  |  Generated {self.generated:%d %b %Y %H:%M}  |  {get_settings().app_name}"))
        self.set_x(15)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # ── helpers ──
    def fit(self, s: str, width: float) -> str:
        """Truncate with '...' so the text fits `width` mm in the current font."""
        if self.get_string_width(s) <= width:
            return s
        while s and self.get_string_width(s + "...") > width:
            s = s[:-1]
        return s.rstrip() + "..."

    def section(self, title: str):
        if self.get_y() > self.page_break_trigger - 25:
            self.add_page()
        self.ln(3)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*MUTED)
        self.cell(0, 6, title.upper(), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*AMBER)
        self.set_line_width(0.6)
        self.line(15, self.get_y(), 33, self.get_y())
        self.set_line_width(0.2)
        self.ln(2.5)
        self.set_text_color(*INK)

    def info_panel(self, x: float, y: float, w: float, title: str, rows: list[tuple[str, str]]) -> float:
        h = 9 + 5.6 * len(rows)
        self.set_fill_color(*SOFT)
        self.set_draw_color(*LINE)
        self.rect(x, y, w, h, style="DF", round_corners=True, corner_radius=2)
        self.set_xy(x + 4, y + 2.5)
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*MUTED)
        self.cell(w - 8, 4, title.upper())
        yy = y + 8
        for k, v in rows:
            self.set_xy(x + 4, yy)
            self.set_font("Helvetica", "", 8.5)
            self.set_text_color(*MUTED)
            self.cell(28, 5, _t(k))
            self.set_font("Helvetica", "B", 8.8)
            self.set_text_color(*INK)
            self.cell(w - 36, 5, self.fit(_t(v), w - 37))
            yy += 5.6
        return h


def render_bom_pdf(bom: Bom, generated: datetime | None = None) -> bytes:
    generated = generated or datetime.now()
    c = bom.checklist
    pdf = _BomPDF(bom, generated)
    pdf.add_page()

    # ── Issued to / Document panels ──
    y = pdf.get_y()
    store = c.branch_name or "-"
    h1 = pdf.info_panel(15, y, 88, "Issued to", [
        ("Store / branch", store), ("Branch code", c.branch_code or "-"), ("Location", c.location or "-"),
        ("Store e-mail", bom.store_email or "-"),
    ])
    issued = bom.finalized_at if bom.status == BOM_FINAL and bom.finalized_at else generated
    h2 = pdf.info_panel(107, y, 88, "Document", [
        ("BOM no.", bom.bom_number), ("Date issued", _date(issued) if bom.status == BOM_FINAL else "Not yet issued"),
        ("PM checklist", c.ref_number or f"#{c.id}"), ("Inspection date", _date(c.checklist_date)),
    ])
    pdf.set_y(y + max(h1, h2) + 4)

    # ── Materials table ──
    pdf.section("Materials required")
    items = list(bom.items)
    has_cost = any(i.unit_cost is not None for i in items)
    upload_dir = get_settings().upload_dir / "bom" / "images"
    cols = ([("#", 8, "C"), ("Photo", 20, "C"), ("Item / description", 64 if has_cost else 98, "L"), ("Part no.", 24, "L"),
             ("Qty", 14, "R"), ("Unit", 14, "L")] + ([("Unit cost", 18, "R"), ("Amount", 18, "R")] if has_cost else []))

    def table_head():
        pdf.set_fill_color(*NAVY)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.8)
        for title, w, align in cols:
            pdf.cell(w, 7, title.upper() + ("  " if align == "R" else ""), border=0, align=align, fill=True)
        pdf.ln(7)
        pdf.set_text_color(*INK)

    table_head()
    if not items:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(180, 10, "No material items.", border="B", align="C", new_x="LMARGIN", new_y="NEXT")
    desc_w = cols[2][1] - 3
    for n, it in enumerate(items, 1):
        # Measure the description cell so the row height fits text or photo.
        pdf.set_font("Helvetica", "B", 9)
        name_lines = pdf.multi_cell(desc_w, 4.4, _t(it.name), dry_run=True, output="LINES")
        pdf.set_font("Helvetica", "", 8)
        desc_lines = pdf.multi_cell(desc_w, 3.9, _t(it.description), dry_run=True, output="LINES") if it.description else []
        find_lines = pdf.multi_cell(desc_w, 3.7, _t(f"Fixes: {it.finding}"), dry_run=True, output="LINES") if it.finding else []
        text_h = 4.4 * len(name_lines) + 3.9 * len(desc_lines) + 3.7 * len(find_lines) + 4
        img_path = (upload_dir / it.image.stored_name) if it.image else None
        has_img = bool(img_path and img_path.is_file())
        row_h = max(text_h, 20 if has_img else 9)
        if pdf.get_y() + row_h > pdf.page_break_trigger:
            pdf.add_page()
            table_head()
        y0 = pdf.get_y()
        if n % 2 == 0:
            pdf.set_fill_color(248, 250, 252)
            pdf.rect(15, y0, 180, row_h, style="F")
        x = 15
        for idx, (_title, w, align) in enumerate(cols):
            pdf.set_xy(x, y0 + 2)
            if idx == 0:
                pdf.set_font("Helvetica", "B", 8.5)
                pdf.set_text_color(*MUTED)
                pdf.cell(w, 4.5, str(n), align="C")
            elif idx == 1:
                if has_img:
                    try:
                        pdf.image(str(img_path), x=x + 2, y=y0 + 2, w=16, h=16, keep_aspect_ratio=True)
                    except Exception:  # unreadable image: leave the cell empty rather than fail the document
                        pass
                else:
                    pdf.set_font("Helvetica", "I", 6.5)
                    pdf.set_text_color(*LINE)
                    pdf.cell(w, 4.5, "no photo", align="C")
            elif idx == 2:
                pdf.set_x(x + 1.5)
                pdf.set_font("Helvetica", "B", 9)
                pdf.set_text_color(*INK)
                pdf.multi_cell(desc_w, 4.4, _t(it.name), align="L", new_x="LEFT", new_y="NEXT")
                if desc_lines:
                    pdf.set_font("Helvetica", "", 8)
                    pdf.set_text_color(51, 65, 85)
                    pdf.multi_cell(desc_w, 3.9, _t(it.description), align="L", new_x="LEFT", new_y="NEXT")
                if find_lines:
                    pdf.set_font("Helvetica", "I", 7.5)
                    pdf.set_text_color(*RED)
                    pdf.multi_cell(desc_w, 3.7, _t(f"Fixes: {it.finding}"), align="L", new_x="LEFT", new_y="NEXT")
            else:
                key = cols[idx][0]
                val = {"Part no.": it.part_number or "-", "Qty": _qty(it.quantity), "Unit": it.unit or "-",
                       "Unit cost": _money(it.unit_cost), "Amount": _money(it.amount)}[key]
                pdf.set_font("Helvetica", "B" if key in ("Qty", "Amount") else "", 8.5)
                pdf.set_text_color(*INK)
                pdf.multi_cell(w - 2.5, 4.4, _t(val), align=align)
            x += w
        pdf.set_draw_color(*LINE)
        pdf.line(15, y0 + row_h, 195, y0 + row_h)
        pdf.set_y(y0 + row_h)

    # ── Totals ──
    if pdf.get_y() + 16 > pdf.page_break_trigger:
        pdf.add_page()
    pdf.ln(3)
    total_qty = sum(i.quantity for i in items)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(100, 6, _t(f"{len(items)} line item(s)  |  total quantity {_qty(total_qty)}"))
    if has_cost:
        total = sum(i.amount or 0 for i in items)
        pdf.set_x(115)
        pdf.set_fill_color(*AMBER_SOFT)
        pdf.set_draw_color(*AMBER)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*INK)
        pdf.cell(80, 9, _t(f"ESTIMATED TOTAL   PHP {_money(total)}"), border=1, align="R", fill=True)
    pdf.ln(11)

    # ── Inspection findings ──
    findings = [(cat.get("category") or "", it) for cat in (c.categories or []) for it in (cat.get("items") or [])
                if (it or {}).get("status") == "not_ok"]
    if findings:
        pdf.section(f"Inspection findings - NOT OK ({len(findings)})")
        pdf.set_font("Helvetica", "B", 7.8)
        pdf.set_fill_color(*SOFT)
        pdf.set_text_color(*MUTED)
        for title, w in (("Category", 45), ("Item", 60), ("Remarks / recommendation", 75)):
            pdf.cell(w, 6, title.upper(), fill=True)
        pdf.ln(6)
        for cat, it in findings:
            note = " / ".join(x for x in (it.get("remarks"), it.get("recommendations")) if x)
            pdf.set_font("Helvetica", "", 8)
            lines = max(len(pdf.multi_cell(w - 2, 3.9, _t(t), dry_run=True, output="LINES"))
                        for t, w in ((cat, 45), (it.get("desc"), 60), (note or "-", 75)))
            h = 3.9 * lines + 2.5
            if pdf.get_y() + h > pdf.page_break_trigger:
                pdf.add_page()
            y0 = pdf.get_y()
            x = 15
            for t, w, bold in ((cat, 45, False), (it.get("desc"), 60, True), (note or "-", 75, False)):
                pdf.set_xy(x + 1, y0 + 1.2)
                pdf.set_font("Helvetica", "B" if bold else "", 8)
                pdf.set_text_color(*INK)
                pdf.multi_cell(w - 2, 3.9, _t(t))
                x += w
            pdf.set_draw_color(*LINE)
            pdf.line(15, y0 + h, 195, y0 + h)
            pdf.set_y(y0 + h)

    # ── Notes ──
    if bom.notes:
        pdf.section("Notes")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*INK)
        pdf.multi_cell(0, 4.8, _t(bom.notes))

    # ── Signatures ──
    if pdf.get_y() + 40 > pdf.page_break_trigger:
        pdf.add_page()
    pdf.section("Sign-off")
    y0 = pdf.get_y() + 12
    for i, (role, name) in enumerate((("Prepared by", bom.prepared_by), ("Checked by", bom.checked_by),
                                      ("Approved by", bom.approved_by))):
        x = 15 + i * 62
        pdf.set_xy(x, y0 - 6)
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(*INK)
        pdf.cell(54, 5, _t(name or ""), align="C")
        pdf.set_draw_color(*INK)
        pdf.line(x, y0, x + 54, y0)
        pdf.set_xy(x, y0 + 1)
        pdf.set_font("Helvetica", "B", 7.8)
        pdf.cell(54, 4, role.upper(), align="C")
        pdf.set_xy(x, y0 + 5)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*MUTED)
        pdf.cell(54, 4, "Signature over printed name / date", align="C")

    return bytes(pdf.output())


def pdf_dir() -> Path:
    d = get_settings().upload_dir / "bom" / "pdf"
    d.mkdir(parents=True, exist_ok=True)
    return d
