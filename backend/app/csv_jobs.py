"""Bounded, in-process CSV jobs. Run one Uvicorn worker (see README)."""

import asyncio
import logging
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from time import monotonic
from uuid import uuid4

import httpx

from app.config import Settings
from app.csv_input import CsvInputError, read_csv_rows, validate_csv_rows
from app.dataset_contract import csv_columns
from app.models import (
    CaseInput,
    CsvJobStatus,
    CsvParseResponse,
    CsvRowError,
    ParseDiagnostics,
    ParseResponse,
)
from app.parser import parse_case, parse_with_rules

logger = logging.getLogger(__name__)


def prepare_csv(raw: bytes, limit: int | None, damage_only: bool):
    rows = read_csv_rows(raw)
    valid, errors = validate_csv_rows(rows, csv_columns() & CaseInput.model_fields.keys())
    eligible = valid
    if damage_only:
        eligible = [item for item in valid if parse_with_rules(item[2])[0].damages] or valid
    values: dict[str, list[str]] = {}
    for _, _, case in eligible:
        for field, value in case.model_dump(mode="json").items():
            if field.startswith("gt_") or field == "ground_truth":
                continue
            if isinstance(value, (str, int, float, bool)) and str(value).strip():
                values.setdefault(field, []).append(str(value))
    unique = {key for key, items in values.items() if len(items) == len(set(items))} | {"id"}
    selected = eligible[:limit] if limit is not None else eligible
    return len(rows), selected, errors, len(selected) < len(eligible), unique


async def process_csv(
    raw: bytes,
    settings: Settings,
    semaphore: asyncio.Semaphore,
    limit: int | None = None,
    damage_only: bool = False,
    progress: Callable[[int, int, int, int], None] | None = None,
) -> CsvParseResponse:
    # Validation and unique-field detection must not block job-status requests.
    total, cases, errors, truncated, unique = await asyncio.to_thread(
        prepare_csv, raw, limit, damage_only
    )
    results: list[ParseResponse | None] = [None] * len(cases)
    completed = 0
    pending = iter(enumerate(cases))

    def report():
        if progress:
            progress(total, len(cases), completed, len(errors))

    report()
    async with httpx.AsyncClient(
        timeout=settings.llm_timeout_seconds,
        limits=httpx.Limits(max_connections=settings.csv_concurrency),
    ) as client:
        async def worker():
            nonlocal completed
            for index, (row_number, source_id, case) in pending:
                try:
                    async with semaphore:
                        try:
                            async with asyncio.timeout(settings.csv_row_timeout_seconds):
                                parsed, diagnostics = await parse_case(
                                    case, settings, llm_client=client
                                )
                        except TimeoutError:
                            parsed, matched = parse_with_rules(case)
                            diagnostics = ParseDiagnostics(
                                mode="rules", llm_used=False, matched_terms=matched,
                                warnings=["Row timed out; deterministic result returned."],
                            )
                    source = case.model_dump(mode="json")
                    results[index] = ParseResponse(
                        parsed=parsed, diagnostics=diagnostics,
                        source_fields={
                            key: str(source[key]) for key in sorted(unique)
                            if source.get(key) not in (None, "")
                        },
                    )
                except Exception:
                    logger.exception("CSV parsing failed for row %s", row_number)
                    errors.append(CsvRowError(
                        row_number=row_number, source_id=source_id,
                        message="This row could not be processed. Other rows were preserved.",
                    ))
                completed += 1
                report()
                # Rules-only parsing can otherwise monopolize the event loop.
                await asyncio.sleep(0)

        async with asyncio.TaskGroup() as group:
            for _ in range(min(settings.csv_concurrency, len(cases))):
                group.create_task(worker())

    return CsvParseResponse(
        total_rows=total, processed_rows=len(cases), truncated=truncated,
        results=[result for result in results if result is not None],
        errors=sorted(errors, key=lambda error: error.row_number),
    )


@dataclass
class Job:
    status: CsvJobStatus
    task: asyncio.Task | None = None
    result: CsvParseResponse | None = None
    finished_at: float | None = None


class JobManager:
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        self.semaphore: asyncio.Semaphore | None = None

    def capacity(self, settings: Settings) -> asyncio.Semaphore:
        if self.semaphore is None:
            self.semaphore = asyncio.Semaphore(settings.csv_concurrency)
        return self.semaphore

    def prune(self, settings: Settings):
        finished = sorted(
            (job for job in self.jobs.values() if job.finished_at is not None),
            key=lambda job: job.finished_at,
        )
        for index, job in enumerate(finished):
            if (monotonic() - job.finished_at > settings.csv_job_ttl_seconds
                    or index < len(finished) - settings.csv_max_retained_jobs):
                del self.jobs[job.status.job_id]

    def submit(self, raw: bytes, settings: Settings, limit: int | None) -> Job:
        self.prune(settings)
        active = sum(job.finished_at is None for job in self.jobs.values())
        if active >= settings.csv_max_active_jobs:
            raise CsvInputError("The parser is busy. Please try again shortly.", status_code=429)
        job = Job(status=CsvJobStatus(job_id=uuid4().hex))
        self.jobs[job.status.job_id] = job
        job.task = asyncio.create_task(self.run(job, raw, settings, limit))
        return job

    async def run(self, job: Job, raw: bytes, settings: Settings, limit: int | None):
        def progress(total: int, selected: int, completed: int, errors: int):
            job.status.total_rows = total
            job.status.selected_rows = selected
            job.status.completed_rows = completed
            job.status.error_count = errors

        job.status.status = "running"
        try:
            job.result = await process_csv(
                raw, settings, self.capacity(settings), limit=limit, progress=progress
            )
            job.status.status = "completed"
        except asyncio.CancelledError:
            job.status.status = "failed"
            job.status.message = "Processing was interrupted by a server shutdown. Please upload again."
            raise
        except Exception as exc:
            logger.exception("CSV job %s failed", job.status.job_id)
            job.status.status = "failed"
            job.status.message = str(exc) if isinstance(exc, CsvInputError) else "CSV processing failed. Please try again."
        finally:
            job.finished_at = monotonic()

    async def close(self):
        tasks = [job.task for job in self.jobs.values() if job.task and not job.task.done()]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task
        self.jobs.clear()
        self.semaphore = None
