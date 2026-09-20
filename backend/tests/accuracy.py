import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.models import CaseInput, ParsedCase
from app.vocabulary import CASE_KINDS, DAMAGE_ZONES


DATASET_PATH = Path(__file__).parents[1] / "data" / "da-cases.csv"
GROUND_TRUTH_FIELDS = {
    "gt_case_type",
    "gt_case_kind",
    "gt_zones",
    "gt_severity",
    "gt_insurance_type",
    "gt_lifecycle_stage",
}
SEVERITY_VALUES = {
    "leicht": "minor",
    "mittel": "moderate",
    "schwer": "severe",
}
LIFECYCLE_VALUES = {
    "neu": "new",
    "laufend": "in_progress",
    "fertig": "ready",
    "abgeschlossen": "completed",
    "storniert": "cancelled",
}


@dataclass(frozen=True)
class ExpectedCase:
    case_type: str
    case_kind: str
    lifecycle: str
    zones: frozenset[str]
    severity: str | None


@dataclass(frozen=True)
class AccuracyReport:
    row_count: int
    case_type: float
    case_kind: float
    lifecycle: float
    zones: float
    severity: float
    severity_rows: int

    def as_dict(self) -> dict[str, float | int]:
        return {
            "row_count": self.row_count,
            "case_type": self.case_type,
            "case_kind": self.case_kind,
            "lifecycle": self.lifecycle,
            "zones": self.zones,
            "severity": self.severity,
            "severity_rows": self.severity_rows,
        }


def load_ground_truth() -> list[ExpectedCase]:
    with DATASET_PATH.open(encoding="utf-8-sig", newline="") as source:
        return [_expected_case(row) for row in csv.DictReader(source)]


def load_unlabelled_cases() -> list[CaseInput]:
    """Load CSV inputs while guaranteeing labels never enter the parser model."""

    allowed_fields = CaseInput.model_fields.keys() - GROUND_TRUTH_FIELDS
    with DATASET_PATH.open(encoding="utf-8-sig", newline="") as source:
        rows = csv.DictReader(source)
        return [
            CaseInput.model_validate(
                {
                    key: (value.strip() if value and value.strip() else None)
                    for key, value in row.items()
                    if key in allowed_fields
                }
            )
            for row in rows
        ]


def score_predictions(
    predictions: Iterable[ParsedCase],
    expected: list[ExpectedCase],
) -> AccuracyReport:
    predictions = list(predictions)
    if len(predictions) != len(expected):
        raise AssertionError(
            f"Expected {len(expected)} predictions, received {len(predictions)}"
        )

    matches = {
        "case_type": 0,
        "case_kind": 0,
        "lifecycle": 0,
        "zones": 0,
        "severity": 0,
    }
    severity_rows = 0

    for prediction, truth in zip(predictions, expected, strict=True):
        matches["case_type"] += prediction.case_type == truth.case_type
        matches["case_kind"] += prediction.case_kind == truth.case_kind
        matches["lifecycle"] += prediction.lifecycle == truth.lifecycle
        matches["zones"] += (
            frozenset(damage.zone for damage in prediction.damages) == truth.zones
        )
        if truth.severity is not None:
            severity_rows += 1
            matches["severity"] += prediction.overall_severity == truth.severity

    row_count = len(expected)
    return AccuracyReport(
        row_count=row_count,
        case_type=matches["case_type"] / row_count,
        case_kind=matches["case_kind"] / row_count,
        lifecycle=matches["lifecycle"] / row_count,
        zones=matches["zones"] / row_count,
        severity=matches["severity"] / severity_rows,
        severity_rows=severity_rows,
    )


def _expected_case(row: dict[str, str]) -> ExpectedCase:
    return ExpectedCase(
        case_type=row["gt_case_type"],
        case_kind=CASE_KINDS[row["gt_case_kind"]],
        lifecycle=LIFECYCLE_VALUES[row["gt_lifecycle_stage"]],
        zones=frozenset(
            DAMAGE_ZONES[zone] for zone in row["gt_zones"].split("|") if zone
        ),
        severity=SEVERITY_VALUES.get(row["gt_severity"]),
    )
