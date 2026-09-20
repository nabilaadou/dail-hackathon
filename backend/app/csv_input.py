import csv
import io

from pydantic import ValidationError

from app.models import CaseInput, CsvRowError


MAX_CSV_BYTES = 25 * 1024 * 1024
ValidatedCase = tuple[int, str | None, CaseInput]


class CsvInputError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def read_csv_rows(raw: bytes) -> list[dict[str | None, str | None]]:
    if not raw:
        raise CsvInputError("The CSV file is empty.")
    if len(raw) > MAX_CSV_BYTES:
        raise CsvInputError("The CSV file exceeds the 25 MB limit.", status_code=413)

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvInputError("The CSV must be UTF-8 encoded.") from exc

    try:
        reader = csv.DictReader(io.StringIO(text), strict=True)
        if not reader.fieldnames:
            raise CsvInputError("The CSV is missing a header row.")
        return [
            row
            for row in reader
            if any(str(value).strip() for value in row.values() if value is not None)
        ]
    except csv.Error as exc:
        raise CsvInputError(f"Invalid CSV: {exc}") from exc


def validate_csv_rows(
    rows: list[dict[str | None, str | None]],
    allowed_fields: set[str] | frozenset[str],
) -> tuple[list[ValidatedCase], list[CsvRowError]]:
    valid_cases: list[ValidatedCase] = []
    errors: list[CsvRowError] = []

    for row_number, row in enumerate(rows, start=2):
        source_id = (row.get("id") or "").strip() or None
        payload = {
            key: (value.strip() if value and value.strip() else None)
            for key, value in row.items()
            if key in allowed_fields
        }

        try:
            valid_cases.append(
                (row_number, source_id, CaseInput.model_validate(payload))
            )
        except ValidationError as exc:
            errors.append(
                CsvRowError(
                    row_number=row_number,
                    source_id=source_id,
                    message=str(exc),
                )
            )

    return valid_cases, errors
