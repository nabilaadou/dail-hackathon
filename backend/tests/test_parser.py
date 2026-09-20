import asyncio

from app.config import Settings
from app.models import CaseInput, LlmResult
from app.parser import parse_case, parse_with_rules


def test_rule_parser_extracts_known_damage_zones() -> None:
    case = CaseInput(
        id=890318,
        manufacturer="Seat",
        model="Ateca",
        in_open_list=True,
        state_name="In Bearbeitung",
        reparation_start_date_time="2026-04-01 09:00:00",
        freitext=(
            "Wildunfall. Kotflügel vorne links handtellergroß feine "
            "Kratzspuren. Auch Stoßstange vorne rechts beschädigt."
        ),
    )

    parsed, _ = parse_with_rules(case)

    assert parsed.case_type == "damage"
    assert parsed.case_kind == "wildlife_collision"
    assert parsed.lifecycle == "in_progress"
    assert {damage.zone for damage in parsed.damages} == {
        "front_left_fender",
        "front_right_bumper",
    }
    left_fender = next(
        damage for damage in parsed.damages if damage.zone == "front_left_fender"
    )
    assert "scratch" in left_fender.damage_types


def test_ground_truth_fields_do_not_change_prediction() -> None:
    case = CaseInput(
        freitext="Inspektion nach Herstellervorgabe.",
        gt_case_type="damage",
        gt_case_kind="Wildunfall",
        gt_zones="Motorhaube",
        gt_severity="schwer",
    )

    parsed, _ = parse_with_rules(case)

    assert parsed.case_type == "service"
    assert parsed.case_kind == "inspection"
    assert parsed.damages == []
    assert parsed.overall_severity == "unknown"


def test_lifecycle_uses_structured_timestamps_before_status_text() -> None:
    case = CaseInput(
        in_open_list=True,
        state_name="Auftrag steht",
        reparation_start_date_time="2026-04-01 09:00:00",
        reparation_end_date_time="2026-04-03 16:00:00",
        completion_date_time="2026-04-03 17:00:00",
        freitext="Kunde bittet Termin zu verschieben.",
    )

    parsed, _ = parse_with_rules(case)

    assert parsed.lifecycle == "ready"


def test_llm_result_tolerates_nullable_optional_output() -> None:
    result = LlmResult.model_validate(
        {
            "case_type": "damage",
            "lifecycle": None,
            "overall_severity": None,
            "damages": [
                {
                    "zone": "hood",
                    "damage_types": "dent",
                    "severity": None,
                }
            ],
        }
    )

    assert result.lifecycle == "unknown"
    assert result.overall_severity == "unknown"
    assert result.damages[0].damage_types == ["dent"]
    assert result.damages[0].severity == "unknown"


def test_missing_text_returns_metadata_only() -> None:
    parsed, diagnostics = asyncio.run(
        parse_case(
            CaseInput(id=1, manufacturer="VW", model="Golf"),
            Settings(llm_enabled=False),
        )
    )

    assert parsed.case_id == 1
    assert parsed.vehicle.manufacturer == "VW"
    assert parsed.case_type == "unknown"
    assert diagnostics.llm_used is False
    assert diagnostics.warnings


def test_states_json_resolves_flattened_state_and_lifecycle() -> None:
    parsed, _ = parse_with_rules(
        CaseInput(
            state_id=12,
            in_open_list=True,
            freitext="Inspektion nach Herstellervorgabe.",
        )
    )

    assert parsed.source_status == "👍 Fertig zur Abholung"
    assert parsed.lifecycle == "ready"
    assert parsed.operations.states[0].category == "Vorgangsstatus"


def test_nested_operational_structures_are_summarized() -> None:
    parsed, _ = parse_with_rules(
        CaseInput.model_validate(
            {
                "states": [{"id": 17}],
                "orders": [
                    {"number": "123456", "insurer_id": 9, "is_huk_relevant": True},
                    {"number": "654321"},
                ],
                "workshop_tasks": [
                    {"work_load": 30, "work_state": 2},
                    {"work_load": 45, "work_state": 3},
                ],
                "freitext": "Parkschaden an der Motorhaube, kleine Delle.",
                "ground_truth": {
                    "case_type": "service",
                    "case_kind": "Inspektion",
                    "zones": [],
                },
            }
        )
    )

    assert parsed.case_type == "damage"
    assert parsed.lifecycle == "in_progress"
    assert parsed.operations.order_count == 2
    assert parsed.operations.order_numbers == ["123456", "654321"]
    assert parsed.operations.workshop_task_count == 2
    assert parsed.operations.work_load_total == 75
    assert parsed.operations.insurer_ids == [9]
    assert parsed.operations.is_huk_relevant is True
