# Wolf Day parser

First parser iteration for the workshop-case dataset.

The API accepts any subset of the CSV columns or a full nested case from
`da-cases.json`. It reads `freitext`, combines
deterministic German vocabulary matches with an optional DeepSeek call, and
returns validated JSON for the vehicle visualization.

`data/schema.json` is the runtime source of truth for accepted CSV columns.
`data/states.json` resolves state ids and supplies status names, categories and
completion flags. Nested `states`, `orders`, and `workshop_tasks` are summarized
in `parsed.operations` and supplied as structured operational context. The
active contract is also available from `GET /dataset-contract`.

Ground-truth fields (`ground_truth` and `gt_*`) are accepted because they exist
in the source formats, but they are never passed to the parser or the LLM.

## Run with uv

```bash
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

Add `DEEPSEEK_API_KEY` to `.env` to enable LLM enrichment. Without a key, the
service uses the deterministic parser only.

## CSV background jobs

The frontend submits CSV uploads to `POST /csv-jobs` and receives a job ID with
HTTP 202 immediately after upload. Add `?limit=100` to process the first 100 valid
rows in CSV order; omit it to process all valid rows. Validation errors are
reported separately. Limits larger than the dataset simply process every valid row.

Poll `GET /csv-jobs/{job_id}` for status and completed/selected row counts, then
fetch `GET /csv-jobs/{job_id}/result` once completed. Status polls do not transfer
the full result dataset. The frontend retries transient connection errors and
remembers the active job in session storage so refreshing the same tab resumes it.

`CSV_CONCURRENCY` defaults to 4 concurrent row parsers shared across CSV jobs.
Each job reuses an HTTP connection pool for LLM requests. `CSV_ROW_TIMEOUT_SECONDS`
defaults to 90; a timed-out row returns deterministic results with a warning.
Unexpected row failures are recorded without discarding other rows. Results retain
CSV order even when rows finish out of order. The legacy synchronous `/parse-csv`
endpoint also uses parallel processing, but large uploads should use jobs.

Transient LLM timeouts, connection failures, HTTP 408/429 responses, server errors,
and malformed model responses are retried twice with exponential backoff and jitter.
Configure this with `LLM_MAX_RETRIES` and `LLM_RETRY_BASE_SECONDS`.

Run **one Uvicorn worker** with this in-process job store. Jobs continue independently
of HTTP requests, but do not survive backend restarts (including `--reload`).
Completed results expire after `CSV_JOB_TTL_SECONDS` (one hour by default), with
at most `CSV_MAX_RETAINED_JOBS` completed jobs retained (10 by default).
`CSV_MAX_ACTIVE_JOBS` defaults to 4; further submissions receive HTTP 429.
For multiple backend replicas or durable restart recovery, replace the in-process
store with a shared queue and persistent result storage.

## Test

```bash
uv run pytest
```

The default suite includes deterministic accuracy scoring across all 1,000 CSV
rows, full-dataset API ingestion, and checks at the 25 MB upload boundary.

Run the live LLM accuracy benchmark across every row with:

```bash
RUN_LIVE_LLM_TESTS=1 uv run pytest -m live_llm -s
```

`LLM_TEST_CONCURRENCY` controls parallel requests and defaults to 12. The
benchmark strips every `gt_*` column before parsing, then reports case type,
case kind, lifecycle, exact damage-zone set, and severity accuracy.

## Example

```bash
curl -X POST http://localhost:8000/parse \
  -H 'Content-Type: application/json' \
  -d '{
    "id": 890318,
    "manufacturer": "Seat",
    "model": "Ateca",
    "freitext": "Wildunfall. Kotflügel vorne links mit Kratzspuren. Stoßstange vorne rechts beschädigt."
  }'
```

The copied source dataset is available at `data/da-cases.csv`.
