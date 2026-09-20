import re
from difflib import get_close_matches

import httpx

from app.config import Settings
from app.dataset_contract import state_by_id
from app.llm import parse_with_llm
from app.models import (
    CaseInput,
    LlmResult,
    OperationsSummary,
    ParseDiagnostics,
    ParsedCase,
    ParsedDamage,
    VehicleSummary,
    WorkshopState,
)
from app.vocabulary import (
    CASE_KIND_ALIASES,
    CASE_KINDS,
    CASE_KIND_VALUES,
    DAMAGE_CASE_KINDS,
    DAMAGE_TYPES,
    DAMAGE_TYPE_VALUES,
    DAMAGE_ZONES,
    LIFECYCLE_VALUES,
    SERVICE_CASE_KINDS,
    SEVERITY_VALUES,
    ZONE_VALUES,
)


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").casefold()).strip()


def closest_allowed(value: str | None, allowed: set[str]) -> str | None:
    if not value:
        return None
    normalized = normalize_text(value).replace(" ", "_")
    if normalized in allowed:
        return normalized
    match = get_close_matches(normalized, sorted(allowed), n=1, cutoff=0.58)
    return match[0] if match else None


def _segments(note: str) -> list[str]:
    return [part.strip() for part in re.split(r"[\n.!?]+", note) if part.strip()]


def _damage_types(text: str) -> list[str]:
    normalized = normalize_text(text)
    return sorted(
        {
            output
            for german, output in DAMAGE_TYPES.items()
            if normalize_text(german) in normalized
        }
    )


def _extract_zones(note: str) -> tuple[list[ParsedDamage], list[str]]:
    normalized_note = normalize_text(note)
    segments = _segments(note)
    damages: list[ParsedDamage] = []
    matched_terms: list[str] = []

    # Longest labels first prevents "front bumper" from shadowing
    # "front-left bumper".
    labels = sorted(DAMAGE_ZONES, key=len, reverse=True)
    specific_labels = {
        normalize_text(label)
        for label in labels
        if label.endswith((" links", " rechts"))
    }

    for label in labels:
        normalized_label = normalize_text(label)
        if normalized_label not in normalized_note:
            continue

        # Do not add a generic bumper when a directional form explains the
        # same occurrence.
        if normalized_label not in specific_labels:
            directional_overlap = any(
                normalized_label in specific
                and specific in normalized_note
                for specific in specific_labels
            )
            if directional_overlap:
                continue

        evidence = next(
            (segment for segment in segments if normalized_label in normalize_text(segment)),
            None,
        )
        damages.append(
            ParsedDamage(
                zone=DAMAGE_ZONES[label],
                source_label=label,
                damage_types=_damage_types(evidence or note),
                evidence=evidence,
            )
        )
        matched_terms.append(label)

    damages.sort(key=lambda damage: damage.zone)
    return damages, matched_terms


def _extract_case_kind(note: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(note)
    for german, output in CASE_KINDS.items():
        if normalize_text(german) in normalized:
            return output, german
    for alias, output in CASE_KIND_ALIASES.items():
        if normalize_text(alias) in normalized:
            return output, alias
    return None, None


def _case_type(case_kind: str | None, damages: list[ParsedDamage]) -> str:
    if damages or case_kind in DAMAGE_CASE_KINDS:
        return "damage"
    if case_kind in SERVICE_CASE_KINDS:
        return "service"
    return "unknown"


def _lifecycle(case: CaseInput) -> str:
    general_state = _general_state(case)
    status = normalize_text(general_state.name if general_state else case.state_name)
    if case.canceled_at or "storniert" in status or "absage" in status:
        return "cancelled"
    if case.in_open_list is False:
        return "completed"
    if (
        (general_state and general_state.is_done)
        or "abgeholt" in status
        or "ausgeliefert" in status
    ):
        return "completed"
    if "fertig" in status or "abholbereit" in status:
        return "ready"
    if case.reparation_end_date_time or case.completion_date_time:
        return "ready"
    if case.reparation_start_date_time:
        return "in_progress"
    if "angelegt" in status or "neu" in status:
        return "new"
    if status:
        return "in_progress"
    if case.in_open_list is True:
        return "new"
    return "unknown"


def _resolved_states(case: CaseInput) -> list[WorkshopState]:
    """Enrich status rows from states.json and support flattened CSV status ids."""

    raw_states = case.states or (
        [
            WorkshopState(
                id=case.state_id,
                name=case.state_name,
                category=case.state_category,
            )
        ]
        if case.state_id is not None
        else []
    )
    vocabulary = state_by_id()
    resolved: list[WorkshopState] = []
    for state in raw_states:
        canonical = vocabulary.get(state.id, {})
        resolved.append(
            state.model_copy(
                update={
                    "name": state.name or canonical.get("name"),
                    "category_id": state.category_id or canonical.get("category_id"),
                    "category": state.category or canonical.get("category"),
                    "is_done": (
                        state.is_done
                        if state.is_done is not None
                        else canonical.get("is_done")
                    ),
                }
            )
        )
    return resolved


def _general_state(case: CaseInput) -> WorkshopState | None:
    states = _resolved_states(case)
    return next(
        (state for state in states if state.category_id == 4),
        states[0] if states else None,
    )


def _operations(case: CaseInput) -> OperationsSummary:
    order_numbers = [order.number for order in case.orders if order.number]
    if not order_numbers:
        if isinstance(case.order_numbers, list):
            order_numbers = case.order_numbers
        elif case.order_numbers:
            order_numbers = [part for part in case.order_numbers.split("|") if part]

    insurer_ids = sorted(
        {
            order.insurer_id
            for order in case.orders
            if order.insurer_id is not None
        }
    )
    if case.insurer_id is not None:
        insurer_ids = sorted(set(insurer_ids) | {case.insurer_id})

    return OperationsSummary(
        states=_resolved_states(case),
        order_count=len(case.orders) if case.orders else (case.order_count or 0),
        order_numbers=order_numbers,
        workshop_task_count=(
            len(case.workshop_tasks)
            if case.workshop_tasks
            else (case.workshop_task_count or 0)
        ),
        work_load_total=(
            sum(task.work_load or 0 for task in case.workshop_tasks)
            if case.workshop_tasks
            else (case.work_load_total or 0)
        ),
        insurer_ids=insurer_ids,
        is_huk_relevant=(
            bool(case.is_huk_relevant)
            or any(bool(order.is_huk_relevant) for order in case.orders)
        ),
    )


def parse_with_rules(case: CaseInput) -> tuple[ParsedCase, list[str]]:
    note = case.freitext or ""
    damages, matched_terms = _extract_zones(note)
    case_kind, case_kind_term = _extract_case_kind(note)
    if case_kind_term:
        matched_terms.append(case_kind_term)

    general_state = _general_state(case)
    parsed = ParsedCase(
        case_id=case.id,
        vehicle=VehicleSummary(
            manufacturer=case.manufacturer,
            model=case.model,
            model_type=case.model_type,
            first_registration=case.first_registration,
            mileage=case.mileage,
        ),
        case_type=_case_type(case_kind, damages),
        case_kind=case_kind,
        lifecycle=_lifecycle(case),
        source_status=general_state.name if general_state else case.state_name,
        operations=_operations(case),
        damages=damages,
    )
    return parsed, matched_terms


def _normalize_llm_result(base: ParsedCase, llm: LlmResult) -> ParsedCase:
    case_type = closest_allowed(llm.case_type, {"damage", "service", "unknown"})
    case_kind = closest_allowed(llm.case_kind, CASE_KIND_VALUES)
    lifecycle = closest_allowed(llm.lifecycle, LIFECYCLE_VALUES)
    overall_severity = closest_allowed(llm.overall_severity, SEVERITY_VALUES)

    llm_damages: dict[str, ParsedDamage] = {}
    for item in llm.damages:
        zone = closest_allowed(item.zone, ZONE_VALUES)
        if not zone:
            continue
        damage_types = sorted(
            {
                normalized
                for value in item.damage_types
                if (normalized := closest_allowed(value, DAMAGE_TYPE_VALUES))
            }
        )
        severity = closest_allowed(item.severity, SEVERITY_VALUES) or "unknown"
        llm_damages[zone] = ParsedDamage(
            zone=zone,
            damage_types=damage_types,
            severity=severity,
            evidence=item.evidence,
        )

    # Exact dictionary matches are retained even if the LLM misses them.
    for rule_damage in base.damages:
        if rule_damage.zone in llm_damages:
            enriched = llm_damages[rule_damage.zone]
            enriched.source_label = rule_damage.source_label
            enriched.damage_types = sorted(
                set(enriched.damage_types) | set(rule_damage.damage_types)
            )
            enriched.evidence = enriched.evidence or rule_damage.evidence
        else:
            llm_damages[rule_damage.zone] = rule_damage

    return base.model_copy(
        update={
            "case_type": case_type or base.case_type,
            "case_kind": case_kind or base.case_kind,
            "lifecycle": lifecycle or base.lifecycle,
            "overall_severity": overall_severity or "unknown",
            "damages": sorted(llm_damages.values(), key=lambda item: item.zone),
            "summary_en": llm.summary_en,
        }
    )


async def parse_case(
    case: CaseInput,
    settings: Settings,
    *,
    llm_client: httpx.AsyncClient | None = None,
) -> tuple[ParsedCase, ParseDiagnostics]:
    parsed, matched_terms = parse_with_rules(case)
    warnings: list[str] = []

    if not case.freitext:
        warnings.append("freitext is missing; only structured metadata was parsed")
        return parsed, ParseDiagnostics(
            mode="rules", llm_used=False, warnings=warnings, matched_terms=matched_terms
        )

    if not settings.llm_enabled or not settings.deepseek_api_key:
        if settings.llm_enabled and not settings.deepseek_api_key:
            warnings.append("LLM skipped because DEEPSEEK_API_KEY is not configured")
        return parsed, ParseDiagnostics(
            mode="rules", llm_used=False, warnings=warnings, matched_terms=matched_terms
        )

    hints = {
        "case_type": parsed.case_type,
        "case_kind": parsed.case_kind,
        "zones": [damage.zone for damage in parsed.damages],
        "damage_types": sorted(
            {kind for damage in parsed.damages for kind in damage.damage_types}
        ),
    }
    status_context = {
        "state_id": case.state_id,
        "state_name": case.state_name,
        "states": [state.model_dump() for state in parsed.operations.states],
        "in_open_list": case.in_open_list,
        "canceled_at": case.canceled_at.isoformat() if case.canceled_at else None,
        "completion_date_time": (
            case.completion_date_time.isoformat()
            if case.completion_date_time
            else None
        ),
        "reparation_start_date_time": (
            case.reparation_start_date_time.isoformat()
            if case.reparation_start_date_time
            else None
        ),
        "reparation_end_date_time": (
            case.reparation_end_date_time.isoformat()
            if case.reparation_end_date_time
            else None
        ),
        "deterministic_lifecycle_hint": parsed.lifecycle,
        "order_count": parsed.operations.order_count,
        "workshop_task_count": parsed.operations.workshop_task_count,
        "work_load_total": parsed.operations.work_load_total,
    }
    severity_evidence = [
        {
            "zone": damage.zone,
            "source_label": damage.source_label,
            "damage_types": damage.damage_types,
            "evidence": damage.evidence,
        }
        for damage in parsed.damages
    ]
    try:
        llm_result = await parse_with_llm(
            case.freitext,
            hints,
            status_context,
            severity_evidence,
            settings,
            client=llm_client,
        )
        parsed = _normalize_llm_result(parsed, llm_result)
        return parsed, ParseDiagnostics(
            mode="rules+llm",
            llm_used=True,
            warnings=warnings,
            matched_terms=matched_terms,
        )
    except Exception as exc:
        # The deterministic result remains usable if the live model is down.
        warnings.append(f"LLM failed; deterministic result returned: {type(exc).__name__}")
        return parsed, ParseDiagnostics(
            mode="rules", llm_used=False, warnings=warnings, matched_terms=matched_terms
        )
