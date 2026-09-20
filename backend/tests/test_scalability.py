import asyncio
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

from app.config import Settings
from app.csv_input import MAX_CSV_BYTES, read_csv_rows
from tests.test_api import request


DATASET_PATH = Path(__file__).parents[1] / "data" / "da-cases.csv"


def test_api_processes_the_complete_csv_dataset() -> None:
    payload = DATASET_PATH.read_bytes()

    started_at = perf_counter()
    with patch("app.main.get_settings", return_value=Settings(llm_enabled=False)):
        response = asyncio.run(
            request(
                "POST",
                "/parse-csv",
                content=payload,
                headers={"content-type": "text/csv"},
            )
        )
    elapsed_seconds = perf_counter() - started_at

    assert response.status_code == 200
    body = response.json()
    assert body["total_rows"] == 1000
    assert body["processed_rows"] == 1000
    assert body["truncated"] is False
    assert body["errors"] == []
    assert len(body["results"]) == 1000
    assert elapsed_seconds < 15


def test_csv_reader_accepts_the_documented_size_limit() -> None:
    header = b"id,freitext\n"
    row_size = 100_000
    remaining = MAX_CSV_BYTES - len(header)
    full_rows, final_row_size = divmod(remaining, row_size)
    rows_payload = [b"1," + (b"a" * (row_size - 3)) + b"\n"] * full_rows
    if final_row_size:
        rows_payload.append(b"1," + (b"a" * (final_row_size - 3)) + b"\n")
    payload = header + b"".join(rows_payload)

    rows = read_csv_rows(payload)

    assert len(payload) == MAX_CSV_BYTES
    assert len(rows) == full_rows + bool(final_row_size)


def test_api_rejects_csv_above_the_documented_size_limit() -> None:
    payload = b"id,freitext\n1," + (b"a" * MAX_CSV_BYTES)

    response = asyncio.run(
        request(
            "POST",
            "/parse-csv",
            content=payload,
            headers={"content-type": "text/csv"},
        )
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "The CSV file exceeds the 25 MB limit."}
