import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.csv_input import MAX_CSV_BYTES, CsvInputError
from app.csv_jobs import JobManager, process_csv
from app.dataset_contract import public_contract
from app.models import CaseInput, CsvJobStatus, CsvParseResponse, ParseResponse
from app.parser import parse_case


logger = logging.getLogger(__name__)


jobs = JobManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await jobs.close()

app = FastAPI(
    title="Wolf Day Parser",
    version="0.1.0",
    description="Parses German workshop cases into visualization-ready JSON.",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Keep unexpected server failures machine-readable for API clients."""

    logger.exception("Unhandled parser error on %s", request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "The parser encountered an unexpected server error."},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/dataset-contract")
async def dataset_contract() -> dict[str, object]:
    """Expose the schema and status vocabulary used by the parser."""

    return public_contract()


@app.post("/parse", response_model=ParseResponse)
async def parse(payload: CaseInput) -> ParseResponse:
    parsed, diagnostics = await parse_case(payload, get_settings())
    return ParseResponse(parsed=parsed, diagnostics=diagnostics)


@app.post("/parse-csv", response_model=CsvParseResponse)
async def parse_csv(
    request: Request,
    limit: int | None = Query(default=None, ge=1),
    damage_only: bool = Query(default=False),
) -> CsvParseResponse:
    """Parse CSV rows, optionally selecting damage cases before LLM enrichment."""

    try:
        settings = get_settings()
        return await process_csv(
            await request.body(), settings, jobs.capacity(settings),
            limit=limit, damage_only=damage_only,
        )
    except CsvInputError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@app.post("/csv-jobs", response_model=CsvJobStatus, status_code=202)
async def create_csv_job(
    request: Request,
    limit: int | None = Query(default=None, ge=1),
) -> CsvJobStatus:
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_CSV_BYTES:
            raise HTTPException(status_code=413, detail="The CSV file exceeds the 25 MB limit.")
    if not raw.strip():
        raise HTTPException(status_code=400, detail="The CSV file is empty.")
    try:
        return jobs.submit(bytes(raw), get_settings(), limit).status
    except CsvInputError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def get_job(job_id: str):
    jobs.prune(get_settings())
    job = jobs.jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail="This analysis has expired or the server restarted. Please upload the CSV again.",
        )
    return job


@app.get("/csv-jobs/{job_id}", response_model=CsvJobStatus)
async def csv_job_status(job_id: str) -> CsvJobStatus:
    return get_job(job_id).status


@app.get("/csv-jobs/{job_id}/result", response_model=CsvParseResponse)
async def csv_job_result(job_id: str) -> CsvParseResponse:
    job = get_job(job_id)
    if job.result is None:
        raise HTTPException(status_code=409, detail=job.status.message or "Analysis is still running.")
    return job.result
