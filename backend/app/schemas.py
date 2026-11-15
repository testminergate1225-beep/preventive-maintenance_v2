"""Request / response schemas. JSON uses camelCase; Python uses snake_case."""

import re
from datetime import date, datetime, time
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)


def to_camel(name: str) -> str:
    """snake_case -> camelCase, capitalising only after underscores.

    (pydantic's helper also capitalises after digits — `v_l1n` -> `vL1N` — which
    didn't match the frontend's `vL1n` and silently dropped those fields.)
    """
    head, *rest = name.split("_")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


T = TypeVar("T")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class InModel(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="ignore"
    )


# ───────────── Lenient scalar parsing (forms send "" for empty inputs) ─────────────


def _blank_to_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


_ISO_DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _parse_date(v: Any) -> Any:
    v = _blank_to_none(v)
    if isinstance(v, str):
        s = v.strip()
        if _ISO_DATE_PREFIX.match(s):
            return s[:10]  # tolerate full ISO datetimes — keep the calendar date
        for fmt in ("%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                pass
    return v


def _parse_time(v: Any) -> Any:
    v = _blank_to_none(v)
    if isinstance(v, str):
        s = v.strip().upper()
        for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M:%S %p"):
            try:
                return datetime.strptime(s, fmt).time()
            except ValueError:
                pass
    return v


def _parse_datetime(v: Any) -> Any:
    v = _blank_to_none(v)
    if isinstance(v, str) and v.endswith("Z"):
        return v[:-1] + "+00:00"
    return v


OptStr = Annotated[str | None, BeforeValidator(_blank_to_none)]
OptDate = Annotated[date | None, BeforeValidator(_parse_date)]
OptTime = Annotated[time | None, BeforeValidator(_parse_time)]
OptDateTime = Annotated[datetime | None, BeforeValidator(_parse_datetime)]
OptFloat = Annotated[float | None, BeforeValidator(_blank_to_none)]
OptInt = Annotated[int | None, BeforeValidator(_blank_to_none)]
# Range constraints must sit on the inner number type, not the `| None` union.
PowerFactor = Annotated[Annotated[float, Field(ge=0, le=1)] | None, BeforeValidator(_blank_to_none)]


def S(max_len: int) -> Any:  # noqa: N802
    """Optional trimmed string with a maximum length; '' becomes null."""
    return Annotated[
        Annotated[str, StringConstraints(max_length=max_len)] | None, BeforeValidator(_blank_to_none)
    ]


Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class Page(CamelModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(CamelModel):
    message: str


# ───────────────────────────── Auth & users ─────────────────────────────


class LoginIn(InModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    remember: bool = False


class UserOut(CamelModel):
    id: int
    uuid: str
    email: str
    full_name: str | None
    role: str
    is_active: bool
    has_password: bool
    last_login_at: datetime | None
    created_at: datetime


class SessionOut(CamelModel):
    user: UserOut
    access_expires_at: datetime


class ForgotPasswordIn(InModel):
    email: EmailStr


class ResetPasswordIn(InModel):
    token: Annotated[str, StringConstraints(min_length=20, max_length=200)]
    password: Password

    @field_validator("password")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Password cannot be blank.")
        return v


class ResetTokenInfo(CamelModel):
    email: str
    full_name: str | None
    purpose: str
    expires_at: datetime


class ChangePasswordIn(InModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password


class VerifyPasswordIn(InModel):
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ProfileUpdateIn(InModel):
    full_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]


class UserCreateIn(InModel):
    email: EmailStr
    full_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    role: Literal["admin", "user"] = "user"
    # Either set an initial password, or leave empty and send an invite afterwards.
    password: Password | None = None


class UserUpdateIn(InModel):
    full_name: Annotated[str, StringConstraints(min_length=1, max_length=255)] | None = None
    role: Literal["admin", "user"] | None = None
    is_active: bool | None = None


class InviteOut(CamelModel):
    message: str
    emailed: bool
    # Only returned when e-mail is not configured, so an admin can deliver the link manually.
    link: str | None = None


class AuditOut(CamelModel):
    id: int
    action: str
    entity_type: str | None
    entity_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime
    user_email: str | None = None
    user_name: str | None = None


# ───────────────────────────── Shared record output ─────────────────────────────


class RecordMeta(CamelModel):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by_name: str | None = None
    deleted_at: datetime | None = None


# ───────────────────────────── Maintenance ─────────────────────────────


class MaintenanceIn(InModel):
    branch_code: S(100) = None
    branch_name: S(255) = None
    location: S(255) = None
    equipment: S(255) = None
    task: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    status: S(50) = None
    performed_by: S(255) = None
    verified_by: S(255) = None
    performed_on: OptDate = None
    next_due: OptDate = None
    notes: S(10000) = None


class MaintenanceOut(RecordMeta):
    branch_code: str | None
    branch_name: str | None
    location: str | None
    equipment: str | None
    task: str
    status: str | None
    performed_by: str | None
    verified_by: str | None
    performed_on: date | None
    next_due: date | None
    notes: str | None
    upload_count: int = 0


# ───────────────────────────── Load balancing ─────────────────────────────

CircuitType = Literal["single_ln", "single_llc", "single_ll", "three_wye", "three_delta"]


THREE_PHASE = "3PH"
Amps = Annotated[Annotated[float, Field(ge=0, le=1_000_000)] | None, BeforeValidator(_blank_to_none)]


class LoadItem(InModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    value: Annotated[float, Field(ge=0, le=3_000_000)] = 0
    phase: Annotated[str, StringConstraints(max_length=10)]
    # Line currents of a three-phase load (phase == "3PH"); unused for single-phase loads.
    ia: Amps = None
    ib: Amps = None
    ic: Amps = None

    @model_validator(mode="after")
    def _three_phase(self):
        if self.phase == THREE_PHASE:
            total = (self.ia or 0) + (self.ib or 0) + (self.ic or 0)
            if total <= 0:
                raise ValueError("A three-phase load needs at least one line current.")
            self.ia, self.ib, self.ic = self.ia or 0.0, self.ib or 0.0, self.ic or 0.0
            self.value = round(total, 2)  # value is always the sum of the line currents
        else:
            self.ia = self.ib = self.ic = None
        return self


class LoadBalancingIn(InModel):
    file_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    ref_id: S(100) = None
    branch_code: S(100) = None
    company: S(255) = None
    location: S(255) = None
    panel: S(255) = None
    mcb: OptInt = None
    main_voltage: OptFloat = None
    wires: S(255) = None
    circuit_type: CircuitType | None = None
    test_date: OptDate = None
    test_time: OptTime = None
    conducted_by: S(255) = None
    witness_by: S(255) = None
    certified_by: S(255) = None
    witness_tenant: S(255) = None
    remarks: S(10000) = None
    v_ll: OptFloat = None
    v_ln: OptFloat = None
    v_ph: OptFloat = None
    v_l1l2: OptFloat = None
    v_l1l3: OptFloat = None
    v_l2l3: OptFloat = None
    v_l1n: OptFloat = None
    v_l2n: OptFloat = None
    v_l3n: OptFloat = None
    loads: Annotated[list[LoadItem], Field(max_length=500)] = []
    phase_a: OptFloat = None
    phase_b: OptFloat = None
    phase_c: OptFloat = None
    total_load: OptFloat = None
    kva_total: OptFloat = None
    nameplate_kw: OptFloat = None
    meas_van: OptFloat = None
    meas_vbn: OptFloat = None
    meas_vcn: OptFloat = None
    meas_ia: OptFloat = None
    meas_ib: OptFloat = None
    meas_ic: OptFloat = None
    pf_a: PowerFactor = None
    pf_b: PowerFactor = None
    pf_c: PowerFactor = None

    @model_validator(mode="after")
    def _three_phase_only_on_three_phase_systems(self):
        if self.circuit_type not in ("three_wye", "three_delta") and any(l.phase == THREE_PHASE for l in self.loads):
            raise ValueError("Three-phase loads are only allowed on Three Phase (Wye) or Three Phase (Delta) systems.")
        return self


class LoadBalancingSummaryOut(RecordMeta):
    file_name: str | None
    ref_id: str | None
    branch_code: str | None
    company: str | None
    location: str | None
    panel: str | None
    circuit_type: str | None
    test_date: date | None
    conducted_by: str | None
    total_load: float | None
    kva_total: float | None
    saved_at: datetime | None


class LoadBalancingOut(LoadBalancingSummaryOut):
    mcb: int | None
    main_voltage: float | None
    wires: str | None
    test_time: time | None
    witness_by: str | None
    certified_by: str | None
    witness_tenant: str | None
    remarks: str | None
    v_ll: float | None
    v_ln: float | None
    v_ph: float | None
    v_l1l2: float | None
    v_l1l3: float | None
    v_l2l3: float | None
    v_l1n: float | None
    v_l2n: float | None
    v_l3n: float | None
    loads: list[dict[str, Any]] | None
    phase_a: float | None
    phase_b: float | None
    phase_c: float | None
    nameplate_kw: float | None
    meas_van: float | None
    meas_vbn: float | None
    meas_vcn: float | None
    meas_ia: float | None
    meas_ib: float | None
    meas_ic: float | None
    pf_a: float | None
    pf_b: float | None
    pf_c: float | None


# ───────────────────────────── Megger ─────────────────────────────

MeggerCircuit = Literal["3phase-delta", "3phase-wye", "1phase-ll", "1phase-ln"]


class MeggerRow(BaseModel):
    """One panel/branch-circuit row. Reading keys keep their original names (e.g. "L1-L2")."""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="ignore")

    panel: S(255) = None
    branch: S(255) = None
    l1_l2: OptFloat = Field(default=None, alias="L1-L2")
    l1_l3: OptFloat = Field(default=None, alias="L1-L3")
    l2_l3: OptFloat = Field(default=None, alias="L2-L3")
    l1_n: OptFloat = Field(default=None, alias="L1-N")
    l2_n: OptFloat = Field(default=None, alias="L2-N")
    l3_n: OptFloat = Field(default=None, alias="L3-N")
    l1_g: OptFloat = Field(default=None, alias="L1-G")
    l2_g: OptFloat = Field(default=None, alias="L2-G")
    l3_g: OptFloat = Field(default=None, alias="L3-G")
    n_g: OptFloat = Field(default=None, alias="N-G")
    wire: S(255) = None
    remarks: S(255) = None


class MeggerIn(InModel):
    file_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    company: S(255) = None
    location: S(255) = None
    subject: S(255) = None
    test_date: OptDate = None
    ir_test_type: S(100) = None
    test_voltage: S(50) = None
    reference_no: S(100) = None
    circuit_type: MeggerCircuit | None = None
    conducted_by: S(255) = None
    witnessed_by: S(255) = None
    verified_by: S(255) = None
    rows: Annotated[list[MeggerRow], Field(max_length=1000)] = []


class MeggerSummaryOut(RecordMeta):
    file_name: str | None
    company: str | None
    location: str | None
    test_date: date | None
    reference_no: str | None
    circuit_type: str | None
    conducted_by: str | None
    saved_at: datetime | None
    row_count: int = 0
    failed_count: int = 0


class MeggerOut(MeggerSummaryOut):
    subject: str | None
    ir_test_type: str | None
    test_voltage: str | None
    witnessed_by: str | None
    verified_by: str | None
    rows: list[dict[str, Any]] | None


# ───────────────────────────── PM checklist ─────────────────────────────


class ChecklistItem(InModel):
    desc: S(1000) = None
    status: Literal["ok", "not_ok", "na", ""] | None = ""
    remarks: S(5000) = None
    recommendations: S(5000) = None


class ChecklistCategory(InModel):
    category: Annotated[str, StringConstraints(max_length=255)]
    subtitle: S(500) = None
    items: Annotated[list[ChecklistItem], Field(max_length=200)] = []


class ChecklistIn(InModel):
    branch_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    branch_code: S(100) = None
    location: S(255) = None
    checklist_date: Annotated[date, BeforeValidator(_parse_date)]
    conducted_by: S(255) = None
    ref_number: S(100) = None
    sig_conducted: S(255) = None
    sig_witnessed: S(255) = None
    sig_store_manager: S(255) = None
    sig_store_rep: S(255) = None
    overall_recommendations: S(10000) = None
    categories: Annotated[list[ChecklistCategory], Field(max_length=50)] = []


class ChecklistSummaryOut(RecordMeta):
    branch_name: str | None
    branch_code: str | None
    location: str | None
    checklist_date: date | None
    conducted_by: str | None
    ref_number: str | None
    saved_at: datetime | None
    ok_count: int = 0
    not_ok_count: int = 0
    na_count: int = 0


class ChecklistOut(ChecklistSummaryOut):
    sig_conducted: str | None
    sig_witnessed: str | None
    sig_store_manager: str | None
    sig_store_rep: str | None
    overall_recommendations: str | None
    categories: list[dict[str, Any]] | None


# ───────────────────────────── Store list ─────────────────────────────


class StoreEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: Annotated[str, StringConstraints(max_length=64)]
    storeType: Literal["", "main", "sat"] = ""  # noqa: N815 — matches the snapshot JSON keys
    noRedemption: bool = False  # noqa: N815
    plCode: str = ""  # noqa: N815
    branchCode: str = ""  # noqa: N815
    branchName: str = ""  # noqa: N815
    sqm: str = ""
    tradeName: str = ""  # noqa: N815
    tw: str = ""
    fh: str = ""
    gotcha: str = ""
    austin: str = ""
    adams: str = ""
    jacks: str = ""
    company: str = ""
    lastPmDate: str = ""  # noqa: N815
    conductedBy: str = ""  # noqa: N815

    @field_validator("*", mode="before")
    @classmethod
    def _none_to_empty(cls, v: Any) -> Any:
        return "" if v is None else v


class StoreArea(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: Annotated[str, StringConstraints(max_length=64)]
    name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    locked: bool = False
    entries: Annotated[list[StoreEntry], Field(max_length=500)] = []


class StoreSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    areas: Annotated[list[StoreArea], Field(max_length=200)]


class StoreListIn(InModel):
    file_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    snapshot: StoreSnapshot


class StoreListSummaryOut(RecordMeta):
    file_name: str | None
    total_main: int
    total_sat: int
    total_redemption: int
    total_areas: int
    saved_at: datetime | None


class StoreListOut(StoreListSummaryOut):
    snapshot: dict[str, Any] | None


# ───────────────────────────── Uploads ─────────────────────────────


class UploadRecordRef(CamelModel):
    id: int
    branch_code: str | None
    branch_name: str | None
    task: str | None
    performed_on: date | None


class UploadOut(CamelModel):
    id: int
    record_id: int | None
    original_name: str
    content_type: str | None
    size_bytes: int
    uploaded_at: datetime
    uploaded_by_name: str | None = None
    deleted_at: datetime | None
    deleted_by_name: str | None = None
    url: str
    record: UploadRecordRef | None = None


class UploadAssociateIn(InModel):
    record_id: int | None


class IdsIn(InModel):
    ids: Annotated[list[int], Field(min_length=1, max_length=500)]


class UploadLimitsOut(CamelModel):
    max_bytes: int
    allowed_extensions: list[str]
