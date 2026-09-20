import asyncio
import csv
import io
import json
from pathlib import Path

import httpx
from unittest.mock import patch

from app.config import Settings
from app.main import app


async def request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, **kwargs)


def test_health() -> None:
    response = asyncio.run(request("GET", "/health"))
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_dataset_contract_comes_from_schema_and_states_files() -> None:
    response = asyncio.run(request("GET", "/dataset-contract"))

    assert response.status_code == 200
    body = response.json()
    assert body["dataset"] == "da-cases"
    assert "workshop_tasks" in {field["name"] for field in body["case_fields"]}
    assert len(body["states"]) == 213


def test_parse_accepts_partial_csv_row() -> None:
    with patch("app.main.get_settings", return_value=Settings(llm_enabled=False)):
        response = asyncio.run(
            request(
                "POST",
                "/parse",
                json={
                    "id": 42,
                    "manufacturer": "BMW",
                    "freitext": "Parkschaden an der Motorhaube, kleine Delle.",
                },
            )
        )

    assert response.status_code == 200
    body = response.json()
    assert body["parsed"]["case_type"] == "damage"
    assert body["parsed"]["case_kind"] == "parking_damage"
    assert body["parsed"]["damages"][0]["zone"] == "hood"
    assert body["diagnostics"]["mode"] == "rules"


def test_parse_csv_uses_three_real_dataset_rows_without_llm() -> None:
    dataset_path = Path(__file__).parents[1] / "data" / "da-cases.csv"
    damage_terms = ("Motorhaube", "Stoßstange", "Kotflügel", "Fahrertür")

    with dataset_path.open(encoding="utf-8-sig", newline="") as dataset:
        reader = csv.DictReader(dataset)
        fieldnames = reader.fieldnames or []
        rows = []
        for row in reader:
            if any(term in (row.get("freitext") or "") for term in damage_terms):
                rows.append(row)
            if len(rows) == 3:
                break

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

    with patch("app.main.get_settings", return_value=Settings(llm_enabled=False)):
        response = asyncio.run(
            request(
                "POST",
                "/parse-csv?limit=3&damage_only=true",
                content=output.getvalue().encode("utf-8"),
                headers={"content-type": "text/csv"},
            )
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total_rows"] == 3
    assert body["processed_rows"] == 3
    assert body["truncated"] is False
    assert len(body["results"]) == 3
    assert body["errors"] == []
    assert all(result["diagnostics"]["llm_used"] is False for result in body["results"])
    assert all(result["parsed"]["damages"] for result in body["results"])
    assert all(result["source_fields"]["id"] for result in body["results"])
    assert all("vehicle_identification_number" in result["source_fields"] for result in body["results"])


def test_parse_accepts_full_nested_dataset_case() -> None:
    dataset_path = Path(__file__).parents[1] / "data" / "da-cases.json"
    with dataset_path.open(encoding="utf-8") as dataset:
        case = json.load(dataset)[0]

    with patch("app.main.get_settings", return_value=Settings(llm_enabled=False)):
        response = asyncio.run(request("POST", "/parse", json=case))

    assert response.status_code == 200
    parsed = response.json()["parsed"]
    assert parsed["case_id"] == case["id"]
    assert parsed["source_status"] == case["states"][0]["name"]
    assert parsed["operations"]["order_count"] == len(case["orders"])
    assert parsed["operations"]["workshop_task_count"] == len(
        case["workshop_tasks"]
    )
    assert parsed["operations"]["work_load_total"] == sum(
        task["work_load"] for task in case["workshop_tasks"]
    )
