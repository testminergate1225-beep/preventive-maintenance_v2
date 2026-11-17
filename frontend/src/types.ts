export type Role = "admin" | "user";

export interface User {
  id: number;
  uuid: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface RecordMeta {
  id: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  deletedAt: string | null;
}
/** Record types that can be archived (PM records, load balancing, megger, checklists). */
export interface ArchivedMeta extends RecordMeta {
  archivedAt: string | null;
  archivedByName: string | null;
  archiveReason: string | null;
}

// ── Maintenance ──
export interface MaintenanceInput {
  branchCode: string;
  branchName: string;
  location: string;
  equipment: string;
  task: string;
  status: string;
  performedBy: string;
  verifiedBy: string;
  performedOn: string;
  nextDue: string;
  notes: string;
}
export interface MaintenanceRecord extends ArchivedMeta {
  branchCode: string | null;
  branchName: string | null;
  location: string | null;
  equipment: string | null;
  task: string;
  status: string | null;
  performedBy: string | null;
  verifiedBy: string | null;
  performedOn: string | null;
  nextDue: string | null;
  notes: string | null;
  uploadCount: number;
}

// ── Load balancing ──
export type CircuitType = "single_ln" | "single_llc" | "single_ll" | "three_wye" | "three_delta";
export interface LoadItem {
  name: string;
  /** Load current (A). For a three-phase load this is the sum of ia + ib + ic. */
  value: number;
  /** "AN"/"BN"/"CN"/"N", "AB"/"BC"/"CA", "L1"... or THREE_PHASE ("3PH") for a balanced/unbalanced 3-phase load. */
  phase: string;
  /** Per-line currents of a three-phase load (Wye: A,B,C · Delta: L1-L2, L1-L3, L2-L3). */
  ia?: number | null;
  ib?: number | null;
  ic?: number | null;
}

export const THREE_PHASE = "3PH";
export interface LoadBalancingSummary extends ArchivedMeta {
  fileName: string | null;
  refId: string | null;
  branchCode: string | null;
  company: string | null;
  location: string | null;
  panel: string | null;
  circuitType: CircuitType | null;
  testDate: string | null;
  conductedBy: string | null;
  totalLoad: number | null;
  kvaTotal: number | null;
  savedAt: string | null;
}
export interface LoadBalancingRecord extends LoadBalancingSummary {
  mcb: number | null;
  mainVoltage: number | null;
  wires: string | null;
  testTime: string | null;
  witnessBy: string | null;
  certifiedBy: string | null;
  witnessTenant: string | null;
  remarks: string | null;
  vLl: number | null;
  vLn: number | null;
  vPh: number | null;
  vL1l2: number | null;
  vL1l3: number | null;
  vL2l3: number | null;
  vL1n: number | null;
  vL2n: number | null;
  vL3n: number | null;
  loads: LoadItem[] | null;
  phaseA: number | null;
  phaseB: number | null;
  phaseC: number | null;
  nameplateKw: number | null;
  measVan: number | null;
  measVbn: number | null;
  measVcn: number | null;
  measIa: number | null;
  measIb: number | null;
  measIc: number | null;
  pfA: number | null;
  pfB: number | null;
  pfC: number | null;
}

// ── Megger ──
export type MeggerCircuit = "3phase-delta" | "3phase-wye" | "1phase-ll" | "1phase-ln";
export const MEGGER_KEYS = ["L1-L2", "L1-L3", "L2-L3", "L1-N", "L2-N", "L3-N", "L1-G", "L2-G", "L3-G", "N-G"] as const;
export type MeggerKey = (typeof MEGGER_KEYS)[number];
export type MeggerRow = { panel: string; branch: string; wire: string; remarks: string } & Record<MeggerKey, string>;
export interface MeggerSummary extends ArchivedMeta {
  fileName: string | null;
  company: string | null;
  location: string | null;
  testDate: string | null;
  referenceNo: string | null;
  circuitType: MeggerCircuit | null;
  conductedBy: string | null;
  savedAt: string | null;
  rowCount: number;
  failedCount: number;
}
export interface MeggerRecord extends MeggerSummary {
  subject: string | null;
  irTestType: string | null;
  testVoltage: string | null;
  witnessedBy: string | null;
  verifiedBy: string | null;
  rows: Array<Record<string, string | number | null>> | null;
}

// ── Checklists ──
export type ItemStatus = "ok" | "not_ok" | "na" | "";
export interface ChecklistItem {
  desc: string;
  status: ItemStatus;
  remarks: string;
  recommendations: string;
}
export interface ChecklistCategory {
  category: string;
  subtitle: string;
  items: ChecklistItem[];
}
export interface ChecklistSummary extends ArchivedMeta {
  branchName: string | null;
  branchCode: string | null;
  location: string | null;
  checklistDate: string | null;
  conductedBy: string | null;
  refNumber: string | null;
  savedAt: string | null;
  okCount: number;
  notOkCount: number;
  naCount: number;
  bomId: number | null;
  bomStatus: BomStatus | null;
}
export interface ChecklistRecord extends ChecklistSummary {
  sigConducted: string | null;
  sigWitnessed: string | null;
  sigStoreManager: string | null;
  sigStoreRep: string | null;
  overallRecommendations: string | null;
  categories: ChecklistCategory[] | null;
}

// ── Bill of Materials ──
export type BomStatus = "draft" | "final";
export interface BomItem {
  id: number;
  position: number;
  name: string;
  description: string | null;
  partNumber: string | null;
  quantity: number;
  unit: string | null;
  unitCost: number | null;
  amount: number | null;
  finding: string | null;
  imageId: number | null;
}
export interface BomLink {
  revision: number;
  sentTo: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  downloadCount: number;
}
export interface Bom {
  id: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  checklistId: number;
  bomNumber: string;
  status: BomStatus;
  revision: number;
  storeEmail: string | null;
  ccEmails: string | null;
  notes: string | null;
  preparedBy: string | null;
  checkedBy: string | null;
  approvedBy: string | null;
  finalizedAt: string | null;
  finalizedByName: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  emailError: string | null;
  itemCount: number;
  items: BomItem[];
  links: BomLink[];
}
export interface BomSendResult {
  bom: Bom;
  emailed: boolean;
  message: string;
  link: string;
  expiresAt: string;
}

// ── Store lists ──
export type StoreType = "" | "main" | "sat";
export interface StoreEntry {
  id: string;
  storeType: StoreType;
  noRedemption: boolean;
  plCode: string;
  branchCode: string;
  branchName: string;
  sqm: string;
  tradeName: string;
  tw: string;
  fh: string;
  gotcha: string;
  austin: string;
  adams: string;
  jacks: string;
  company: string;
  lastPmDate: string;
  conductedBy: string;
}
export interface StoreArea {
  id: string;
  name: string;
  locked: boolean;
  entries: StoreEntry[];
}
export interface StoreSnapshot {
  areas: StoreArea[];
}
export interface SharedUser {
  id: number;
  email: string;
  fullName: string | null;
}
export interface StoreListSummary extends RecordMeta {
  /** Users (non-admin) who can view & edit; only populated for admins. */
  sharedWith: SharedUser[];
  fileName: string | null;
  totalMain: number;
  totalSat: number;
  totalRedemption: number;
  totalAreas: number;
  savedAt: string | null;
}
export interface StoreListRecord extends StoreListSummary {
  snapshot: StoreSnapshot | null;
}

// ── Uploads ──
export interface Upload {
  id: number;
  recordId: number | null;
  originalName: string;
  contentType: string | null;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByName: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  url: string;
  record: { id: number; branchCode: string | null; branchName: string | null; task: string | null; performedOn: string | null } | null;
}

// ── Stats / audit ──
export interface Bucket {
  label: string;
  count: number;
}
export interface Dashboard {
  counts: Record<"maintenance" | "maintenanceArchived" | "loadBalancing" | "meggerTests" | "checklists" | "storeLists" | "uploads", number>;
  overdue: number;
  dueSoon: number;
  completedThisMonth: number;
  statusBreakdown: Bucket[];
  equipmentTop: Bucket[];
  monthly: Bucket[];
  recent: MaintenanceRecord[];
  upcoming: MaintenanceRecord[];
}
export interface AuditEntry {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
}
