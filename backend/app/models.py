from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WorkshopState(BaseModel):
    id: int
    name: str | None = None
    category_id: int | None = None
    category: str | None = None
    is_done: bool | None = None


class Statable(BaseModel):
    id: int | None = None
    state_id: int | None = None
    statable_id: int | None = None
    statable_type: str | None = None
    state_reason_id: int | None = None
    changed_by: int | None = None
    created_by: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkshopOrder(BaseModel):
    id: int | None = None
    note: str | None = None
    number: str | None = None
    external_ref: str | None = None
    gateway_ref: str | None = None
    dossier_id: int | None = None
    insurer_id: int | None = None
    insurer_reference: str | None = None
    auto_repair_manager_id: int | None = None
    auto_repair_manager_reference: str | None = None
    application_id: str | None = None
    created_by: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    order_type_id: int | None = None
    is_sub_order: bool | int | None = None
    is_controlled: bool | None = None
    is_huk_relevant: bool | None = None


class WorkshopTask(BaseModel):
    id: int | None = None
    dossier_id: int | None = None
    workshop_team_id: int | None = None
    start_date: date | None = None
    start_time: time | None = None
    work_load: int | None = None
    work_state: int | None = None
    workshop_service_id: int | None = None
    order_id: int | None = None
    description: str | None = None


class GroundTruth(BaseModel):
    """Evaluation labels accepted from JSON but never used during parsing."""

    case_type: str | None = None
    case_kind: str | None = None
    zones: list[str] = Field(default_factory=list)
    severity: str | None = None
    insurance_type: str | None = None
    lifecycle_stage: str | None = None


class CaseInput(BaseModel):
    """A nested JSON case or flattened CSV row; fields may be partial."""

    model_config = ConfigDict(extra="forbid")

    id: int | None = None
    external_ref: str | None = None
    application_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    canceled_at: datetime | None = None
    in_open_list: bool | None = None
    completion_date_time: datetime | None = None
    reparation_start_date_time: datetime | None = None
    reparation_end_date_time: datetime | None = None
    vehicle_id: int | None = None
    contact_id: int | None = None
    license_plate: str | None = None
    vehicle_identification_number: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    model_type: str | None = None
    first_registration: date | None = None
    mileage: int | None = None
    company: str | None = None
    salutation_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    street: str | None = None
    zip_code: str | None = None
    city: str | None = None
    email: str | None = None
    phone: str | None = None
    customer_number: str | None = None
    note: str | None = None
    states: list[WorkshopState] = Field(default_factory=list)
    statables: list[Statable] = Field(default_factory=list)
    orders: list[WorkshopOrder] = Field(default_factory=list)
    workshop_tasks: list[WorkshopTask] = Field(default_factory=list)
    ground_truth: GroundTruth | None = None
    state_id: int | None = None
    state_name: str | None = None
    state_category: str | None = None
    state_ids: str | list[int] | None = None
    order_count: int | None = None
    order_numbers: str | list[str] | None = None
    insurer_id: int | None = None
    is_huk_relevant: bool | None = None
    workshop_task_count: int | None = None
    work_load_total: int | None = None
    gt_case_type: str | None = None
    gt_case_kind: str | None = None
    gt_zones: str | list[str] | None = None
    gt_severity: str | None = None
    gt_insurance_type: str | None = None
    gt_lifecycle_stage: str | None = None
    freitext: str | None = None


class VehicleSummary(BaseModel):
    manufacturer: str | None = None
    model: str | None = None
    model_type: str | None = None
    first_registration: date | None = None
    mileage: int | None = None


class OperationsSummary(BaseModel):
    states: list[WorkshopState] = Field(default_factory=list)
    order_count: int = 0
    order_numbers: list[str] = Field(default_factory=list)
    workshop_task_count: int = 0
    work_load_total: int = 0
    insurer_ids: list[int] = Field(default_factory=list)
    is_huk_relevant: bool = False


class ParsedDamage(BaseModel):
    zone: str
    source_label: str | None = None
    damage_types: list[str] = Field(default_factory=list)
    severity: Literal["minor", "moderate", "severe", "unknown"] = "unknown"
    evidence: str | None = None


class ParsedCase(BaseModel):
    case_id: int | None = None
    vehicle: VehicleSummary
    case_type: Literal["damage", "service", "unknown"] = "unknown"
    case_kind: str | None = None
    lifecycle: Literal[
        "new", "in_progress", "ready", "completed", "cancelled", "unknown"
    ] = "unknown"
    source_status: str | None = None
    operations: OperationsSummary = Field(default_factory=OperationsSummary)
    overall_severity: Literal["minor", "moderate", "severe", "unknown"] = "unknown"
    damages: list[ParsedDamage] = Field(default_factory=list)
    summary_en: str | None = None


class ParseDiagnostics(BaseModel):
    mode: Literal["rules", "rules+llm"]
    llm_used: bool
    warnings: list[str] = Field(default_factory=list)
    matched_terms: list[str] = Field(default_factory=list)


class ParseResponse(BaseModel):
    parsed: ParsedCase
    diagnostics: ParseDiagnostics
    source_fields: dict[str, str] = Field(default_factory=dict)


class CsvRowError(BaseModel):
    row_number: int
    source_id: str | None = None
    message: str


class CsvParseResponse(BaseModel):
    total_rows: int
    processed_rows: int
    truncated: bool = False
    results: list[ParseResponse] = Field(default_factory=list)
    errors: list[CsvRowError] = Field(default_factory=list)


class CsvJobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    total_rows: int = 0
    selected_rows: int = 0
    completed_rows: int = 0
    error_count: int = 0
    message: str | None = None


class LlmDamage(BaseModel):
    zone: str | None = None
    damage_types: list[str] = Field(default_factory=list)
    severity: str = "unknown"
    evidence: str | None = None

    @field_validator("damage_types", mode="before")
    @classmethod
    def normalize_damage_types(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        return value

    @field_validator("severity", mode="before")
    @classmethod
    def normalize_severity(cls, value: Any) -> str:
        return value or "unknown"


class LlmResult(BaseModel):
    case_type: str = "unknown"
    case_kind: str | None = None
    lifecycle: str = "unknown"
    overall_severity: str = "unknown"
    damages: list[LlmDamage] = Field(default_factory=list)
    summary_en: str | None = None

    @field_validator("case_type", "lifecycle", "overall_severity", mode="before")
    @classmethod
    def normalize_required_labels(cls, value: Any) -> str:
        return value or "unknown"

    @field_validator("damages", mode="before")
    @classmethod
    def normalize_damages(cls, value: Any) -> list[dict[str, Any]]:
        return value or []
