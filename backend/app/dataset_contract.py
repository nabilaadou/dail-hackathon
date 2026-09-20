"""Runtime access to the dataset's machine-readable contract.

The JSON files in ``data`` are the source of truth for accepted CSV columns and
the workshop-state vocabulary.  Prediction labels (``ground_truth``/``gt_*``)
are intentionally not exposed by this module.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parents[1] / "data"


@lru_cache
def dataset_schema() -> dict[str, Any]:
    with (DATA_DIR / "schema.json").open(encoding="utf-8") as source:
        return json.load(source)


@lru_cache
def states_document() -> dict[str, Any]:
    with (DATA_DIR / "states.json").open(encoding="utf-8") as source:
        return json.load(source)


def csv_columns() -> frozenset[str]:
    return frozenset(dataset_schema()["csv_columns"])


@lru_cache
def state_by_id() -> dict[int, dict[str, Any]]:
    return {state["id"]: state for state in states_document()["states"]}


def public_contract() -> dict[str, Any]:
    """Return non-sensitive contract metadata useful to API clients."""

    schema = dataset_schema()
    states = states_document()
    return {
        "dataset": schema["dataset"],
        "version": schema["version"],
        "encoding": schema["encoding"],
        "case_fields": schema["case_fields"],
        "csv_columns": schema["csv_columns"],
        "state_categories": states["state_categories"],
        "states": states["states"],
    }
