import type { Bom, ChecklistCategory } from "@/types";
import { uid } from "@/lib/utils";

export interface BomItemForm {
  key: string;
  name: string;
  description: string;
  partNumber: string;
  quantity: string;
  unit: string;
  unitCost: string;
  finding: string;
  imageId: number | null;
}

export interface BomForm {
  storeEmail: string;
  ccEmails: string;
  notes: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  items: BomItemForm[];
}

export const UNITS = ["pc", "pcs", "set", "pair", "m", "ft", "roll", "box", "pack", "lot", "L", "kg", "unit"];

export const blankItem = (finding = ""): BomItemForm => ({
  key: uid(), name: "", description: "", partNumber: "", quantity: "1", unit: "pc", unitCost: "", finding, imageId: null,
});

export const emptyBomForm = (preparedBy = ""): BomForm => ({
  storeEmail: "", ccEmails: "", notes: "", preparedBy, checkedBy: "", approvedBy: "", items: [],
});

export function bomToForm(b: Bom): BomForm {
  return {
    storeEmail: b.storeEmail ?? "", ccEmails: b.ccEmails ?? "", notes: b.notes ?? "", preparedBy: b.preparedBy ?? "",
    checkedBy: b.checkedBy ?? "", approvedBy: b.approvedBy ?? "",
    items: b.items.map((i) => ({
      key: uid(), name: i.name, description: i.description ?? "", partNumber: i.partNumber ?? "", quantity: String(i.quantity),
      unit: i.unit ?? "", unitCost: i.unitCost == null ? "" : String(i.unitCost), finding: i.finding ?? "", imageId: i.imageId,
    })),
  };
}

/** Lines with nothing typed are dropped; numbers are parsed. */
export function bomPayload(f: BomForm) {
  return {
    storeEmail: f.storeEmail.trim(), ccEmails: f.ccEmails.trim(), notes: f.notes.trim(), preparedBy: f.preparedBy.trim(),
    checkedBy: f.checkedBy.trim(), approvedBy: f.approvedBy.trim(),
    items: f.items.filter((i) => i.name.trim()).map((i) => ({
      name: i.name.trim(), description: i.description.trim(), partNumber: i.partNumber.trim(),
      quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1, unit: i.unit.trim(),
      unitCost: i.unitCost.trim() === "" ? null : Number(i.unitCost), finding: i.finding.trim(), imageId: i.imageId,
    })),
  };
}

/** Problems that block saving (unnamed lines with other data, bad numbers). */
export function bomProblems(f: BomForm): string[] {
  const out: string[] = [];
  f.items.forEach((i, n) => {
    const touched = i.description || i.partNumber || i.unitCost || i.imageId;
    if (!i.name.trim() && touched) out.push(`Line ${n + 1} needs an item name.`);
    if (i.name.trim() && !(Number(i.quantity) > 0)) out.push(`Line ${n + 1}: quantity must be more than 0.`);
    if (i.unitCost.trim() && !(Number(i.unitCost) >= 0)) out.push(`Line ${n + 1}: unit cost must be a number.`);
  });
  return out;
}

/** "Category > item" labels of every NOT OK checklist item. */
export function notOkFindings(categories: ChecklistCategory[] | null | undefined) {
  return (categories ?? []).flatMap((c) => c.items.filter((i) => i.status === "not_ok").map((i) => ({
    label: `${c.category} > ${i.desc || "Item"}`,
    hint: [i.remarks, i.recommendations].filter(Boolean).join(" · "),
  })));
}

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function totals(items: BomItemForm[]) {
  const lines = items.filter((i) => i.name.trim());
  const qty = lines.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const costed = lines.filter((i) => i.unitCost.trim() !== "" && Number(i.unitCost) >= 0);
  const amount = costed.reduce((s, i) => s + (Number(i.quantity) || 0) * Number(i.unitCost), 0);
  return { lines: lines.length, qty, amount, hasCost: costed.length > 0 };
}
