/**
 * Domain option lists, carried over from the original forms.
 * Edit here to change dropdowns across the app.
 */

export const BRANCHES = ["Funhouse", "TOMSWORLD", "ADAMS QUEST", "JACKS ADVENTURE", "AUSTINLAND"];

export const TECHNICIANS = [
  "Johny Austria / Joseph Cristal Jr",
  "Petemar Solano / Jerico Simon",
  "Ronil Jardio / Chris Neri",
  "Joseph Cristal Jr / Johny Austria",
  "Jerico Simon / Petemar Solano",
  "Chris Neri / Ronil Jardio",
  "Joseph Cristal Jr",
  "Jerico Simon",
  "Johny Austria",
  "Petemar Solano",
  "Ronil Jardio",
  "Chris Neri",
];

export const STATUSES = [
  "OK", "Repaired", "Requires Follow-up", "Replaced", "Not Applicable", "Pending", "Ongoing", "Checked",
  "Tested", "Measured", "Inspected", "Serviced", "Cleaned", "Started", "Completed",
];

/** Visual tone for each status — drives pills, chart colours and icons. */
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
export function statusTone(status?: string | null): Tone {
  switch ((status ?? "").toLowerCase()) {
    case "ok": case "repaired": case "replaced": case "completed": case "serviced": case "cleaned":
    case "checked": case "tested": case "measured": case "inspected":
      return "ok";
    case "pending": case "ongoing": case "started":
      return "warn";
    case "requires follow-up":
      return "danger";
    case "not applicable":
      return "neutral";
    default:
      return "info";
  }
}

export const EQUIPMENT: Array<{ value: string; label: string }> = [
  ["Lighting", "Lighting"], ["Panel Board", "Panel Board"], ["Transformer", "Transformer"], ["Motor", "Motor"],
  ["UPS/Battery", "UPS/Battery"], ["Cabling", "Cabling"], ["Grounding", "Grounding Cable"], ["Baseboard", "Baseboard CO"],
  ["Air Conditioning", "Air Conditioning unit Power Supply"], ["Switch", "Switch"], ["Dome light", "Dome light"],
  ["Emergency Light", "Emergency Light"], ["Exit Sign", "Exit Signage"], ["smd led blue", "SMD LED 5050 Blue Lights"],
  ["smd led", "SMD LED 5050 Warm White"], ["smart led", "ADDRESSABLE SMART LED"], ["Control box", "Control Box"],
  ["CCTV UTP Cable", "CCTV CAT6 Cable"], ["Cove light", "Cove light"], ["Flood light", "Flood light"],
  ["Spot light", "Spot light"], ["Recessed light", "Recessed light"], ["Panel light", "Panel light"],
  ["Fluorescent", "Led Fluorescent tube"], ["Timer", "24 hr Timer"], ["CCTV", "CCTV DVR/NVR"],
  ["Circuit Breaker", "Circuit Breaker"], ["Convenience Outlet", "Convenience Outlet (CO)"],
  ["Telephone outlet", "DATA and Telephone outlet"], ["Grounding busbar", "Grounding busbar"],
  ["Neutral busbar", "Neutral busbar"], ["Terminal Lugs", "Terminal Lugs"], ["Entrance Signage", "Entrance Signage"],
  ["Auxiliary Lighting", "Auxiliary Lighting"], ["Magnetic Contactor", "Magnetic Contactor"],
  ["Automatic Transfer Switch", "Automatic Transfer Switch"], ["Manual Transfer Switch", "Manual Transfer Switch"],
  ["Cooling Fan", "Cooling Fan"], ["Exhaust Fan", "Exhaust Fan"], ["Fire Alarm System", "FDAS"],
  ["THHN Wires", "THHN Wires"], ["TF Wire", "TF Wire"], ["PVC Conduit", "PVC Conduit"], ["EMT Conduit", "EMT Conduit"],
  ["RSC Conduit", "RSC Conduit"], ["Flexible Conduit", "Flexible Metallic Conduit (FMC)"], ["Cable Tray", "Cable Tray"],
  ["Cable Ladder", "Cable Ladder"], ["Other", "Other"],
].map(([value, label]) => ({ value, label }));

export function equipmentLabel(v?: string | null): string {
  return EQUIPMENT.find((e) => e.value === v)?.label ?? v ?? "—";
}

export const COMPANIES = [
  "Tom & Joy Inc", "Planet Tom Inc", "Joe Master Claw Inc", "Afentiko Philippines Corporation", "Tom's Universe Inc",
  "Jack and Adam Corporation", "JA Claw Creation Inc", "Joy Planet Inc", "Pambi Corporation",
  "Tom's World Philippines Corporation",
];

// ── Load balancing ──
export const CIRCUIT_TYPES = [
  { value: "single_ln", label: "Single Phase (Line-to-Neutral)" },
  { value: "single_llc", label: "Single Phase (Line-to-Line / Combined)" },
  { value: "single_ll", label: "Single Phase (Line-to-Line / Split)" },
  { value: "three_wye", label: "Three Phase (Wye / Line-to-Neutral)" },
  { value: "three_delta", label: "Three Phase (Delta / Line-to-Line)" },
] as const;

// ── Megger ──
export const MEGGER_CIRCUITS = [
  { value: "3phase-delta", label: "Three Phase Delta" },
  { value: "3phase-wye", label: "Three Phase Wye" },
  { value: "1phase-ll", label: "Single Phase Line to Line" },
  { value: "1phase-ln", label: "Single Phase Line to Neutral" },
] as const;
export const IR_TEST_TYPES = ["PI - 10mins and Above", "DAR - 30Second period"];
export const WIRE_SIZES = [
  "3.5 SQ MM, THHN", "5.5 SQ MM, THHN", "8.0 SQ MM, THHN", "14.0 SQ MM, THHN", "22.0 SQ MM, THHN", "30.0 SQ MM, THHN",
  "38.0 SQ MM, THHN", "50.0 SQ MM, THHN", "60 SQ MM, THHN", "80 SQ MM, THHN", "100 SQ MM, THHN", "125 SQ MM, THHN",
];

// ── PM checklist template ──
export const CHECKLIST_TEMPLATE: Array<{ category: string; subtitle: string; items: string[] }> = [
  { category: "1. Panel Boards", subtitle: "(power panel, lighting panel, emergency panel, control panel, circuit breaker, busbar, panel box)",
    items: ["a. Circuit breaker / Feederline temperature", "b. Circuit breaker bolts", "c. Terminal Lugs",
      "d. Panel Board Enclosure - Cleanliness", "e. Full load line - current balancing", "f. Busbar Bolts",
      "g. Circuit Directory / Panel board - Name Tag", "h. Power-on Delay ( Timer, magnetic Contactor )", "i. Wires and Cable"] },
  { category: "2. Lighting", subtitle: "(blue lights, dome lights, down lights, cove lights, signage, emergency lights and auxiliary lighting)",
    items: ["a. Bluelights - Canopy Covelight ( SMD LED STRIPS )", "b. warmwhite - Canopy Covelight ( SMD LED STRIPS )",
      "c. Dome light / Dome Reflector", "d. LED Fluorescents tube", "e. Entrance and exit signage", "f. Addressable LED Lights",
      "g. Emergency Lights", "h. Auxiliary lighting", "i. Wires and Cable", "j. Others"] },
  { category: "3. Convenience Outlet", subtitle: "(power, data and telephone outlet)",
    items: ["a. Floor Convenience outlet - FCO", "b. Convenience outlet - CO", "c. DATA and Telephone Outlet",
      "d. Wall Outlet - WCO", "e. Emergency light CO", "f. Table Top CO", "g. Others"] },
  { category: "4. Switches", subtitle: "",
    items: ["a. Switch Plate and cover", "b. Magnetic Switch - magnetic contactor", "c. Pushbutton switch / nc /no",
      "d. Control wires and cables", "e. Wifi controlled switch", "f. 2 gang switch", "g. 1 gang switch", "h. Timed switch - 24hr timer"] },
  { category: "5. Transformer", subtitle: "(Cooling fan, enclosure, terminal lugs primary and secondary)",
    items: ["a. Input and Output voltage", "b. Temperature", "c. Bolt and nuts", "d. Terminal Lugs - LINE 1, LINE 2, LINE 3, NEUTRAL",
      "e. Cooling Fan", "f. Grounding terminal Lugs", "g. Terminal busbar", "h. Full load current", "i. Enclosure - NEMA 1"] },
  { category: "6. Air Conditioning Unit", subtitle: "( Main circuit breaker, FCU AND ACCU )",
    items: ["a. Air Filter", "b. Thermostat settings - verify if match the desired temperature output",
      "c. Drain pans - Check for moisture buildup and clean drain pans to prevent clogs", "d. Refrigerant level",
      "e. Main Circuit Breaker", "f. Wires and Cable", "g. Electrical Controls", "h. Others"] },
  { category: "7. Fire Alarm System", subtitle: "",
    items: ["a. Smoke Detectors", "b. Heat Detectors", "c. Manual Call Points", "d. Fire Alarm Control Panel",
      "e. Bell / Strobe / Horn", "f. Wiring and Cable", "g. Battery Backup", "h. Others"] },
  { category: "8. CCTV", subtitle: "",
    items: ["a. Video Signal", "b. Camera and lense housing", "c. Wiring connection", "d. NVR/DVR - Cooling fans",
      "e. Recording and playback", "f. UPS Battery"] },
];

// ── Store list ──
export const DEFAULT_AREAS = [
  "NORTH 1", "NORTH 2", "NORTH 3", "NORTH 4", "NORTH 5", "NORTH 6", "CENTRAL 1", "CENTRAL 2", "CENTRAL 3",
  "SOUTH 1", "SOUTH 2", "SOUTH 3", "SOUTH 4", "SOUTH 5", "SOUTH 6", "VISAYAS 1", "VISAYAS 2", "MINDANAO 1",
];
export const BRAND_FIELDS = ["tw", "fh", "gotcha", "austin", "adams", "jacks"] as const;
export type BrandField = (typeof BRAND_FIELDS)[number];
export const BRAND_LABELS: Record<BrandField, string> = {
  tw: "Tom's World", fh: "Funhouse", gotcha: "Gotcha", austin: "Austin", adams: "Adams", jacks: "Jack Adventure",
};
export const BRAND_SHORT: Record<BrandField, string> = { tw: "TW", fh: "FH", gotcha: "GOTCHA", austin: "AUSTIN", adams: "ADAM'S", jacks: "JACK'S" };

export const TRADE_NAME_BRANDS: Record<string, Partial<Record<BrandField, 1>>> = {
  "Tom's World": { tw: 1 }, Funhouse: { fh: 1 }, Gotcha: { gotcha: 1 }, Austin: { austin: 1 }, "Adam's": { adams: 1 },
  "Jack Adventure": { jacks: 1 }, "Tom's World / Funhouse": { tw: 1, fh: 1 }, "Tom's World / Gotcha": { tw: 1, gotcha: 1 },
  "Tom's World / Austin": { tw: 1, austin: 1 }, "Tom's World / Jack Adventure": { tw: 1, jacks: 1 },
  "Tom's World / Adam's": { tw: 1, adams: 1 }, "Tom's World / Funhouse / Gotcha": { tw: 1, fh: 1, gotcha: 1 },
  "Tom's World / Funhouse / Austin": { tw: 1, fh: 1, austin: 1 }, "Tom's World / Funhouse / Jack Adventure": { tw: 1, fh: 1, jacks: 1 },
  "Tom's World / Funhouse / Adam's": { tw: 1, fh: 1, adams: 1 }, "Funhouse / Austin": { fh: 1, austin: 1 },
  "Funhouse / Jack Adventure": { fh: 1, jacks: 1 }, "Funhouse / Adam's": { fh: 1, adams: 1 }, "Funhouse / Gotcha": { fh: 1, gotcha: 1 },
  "Gotcha / Austin": { gotcha: 1, austin: 1 }, "Gotcha / Jack Adventure": { gotcha: 1, jacks: 1 }, "Gotcha / Adam's": { gotcha: 1, adams: 1 },
  "Austin / Jack Adventure": { austin: 1, jacks: 1 }, "Austin / Adam's": { austin: 1, adams: 1 }, "Jack Adventure / Adam's": { jacks: 1, adams: 1 },
  Other: {},
};
export const TRADE_NAMES = Object.keys(TRADE_NAME_BRANDS);

// ── Performance chart team definitions ──
export const TEAM_GROUPS = [
  { key: "johny austria|joseph cristal jr", label: "Austria & Cristal", members: ["Johny Austria", "Joseph Cristal Jr"] },
  { key: "jerico simon|petemar solano", label: "Simon & Solano", members: ["Jerico Simon", "Petemar Solano"] },
  { key: "chris neri|ronil jardio", label: "Jardio & Neri", members: ["Ronil Jardio", "Chris Neri"] },
];
export const INDIVIDUALS = ["Joseph Cristal Jr", "Jerico Simon", "Johny Austria", "Petemar Solano", "Ronil Jardio", "Chris Neri"];
/** Old spellings that should count as the canonical name. */
export const NAME_ALIASES: Record<string, string[]> = {
  "joseph cristal jr": ["joseph cristal jr", "joseph cristal", "joseph christal", "joseph christal jr"],
};
