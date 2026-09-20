import asyncio
from time import monotonic
from unittest.mock import patch

import httpx

from app.config import Settings
from app.csv_jobs import JobManager, process_csv
from app.main import app
from app.models import ParseDiagnostics
from app.parser import parse_with_rules


PAYLOAD = b"id,license_plate,freitext\n1,ABC-001,Inspektion\n2,ABC-002,Delle\n3,ABC-003,Kratzer\n4,ABC-004,Service\n5,ABC-005,Service\n"


def test_background_submission_polling_limits_order_and_global_concurrency():
    async def scenario():
        manager = JobManager()
        settings = Settings(llm_enabled=False, csv_concurrency=2, csv_max_active_jobs=2)
        release = asyncio.Event()
        workers_started = asyncio.Event()
        active = 0
        peak = 0

        async def slow_parse(case, settings, **kwargs):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            if active == 2:
                workers_started.set()
            try:
                await release.wait()
                # Complete later rows first; the response must still retain CSV order.
                await asyncio.sleep((6 - case.id) * 0.001)
                return parse_with_rules(case)[0], ParseDiagnostics(mode="rules", llm_used=False)
            finally:
                active -= 1

        with (
            patch("app.main.jobs", manager),
            patch("app.main.get_settings", return_value=settings),
            patch("app.csv_jobs.parse_case", side_effect=slow_parse),
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                first = await asyncio.wait_for(client.post("/csv-jobs?limit=4", content=PAYLOAD), 2)
                assert first.status_code == 202
                first_id = first.json()["job_id"]
                second = await client.post("/csv-jobs", content=PAYLOAD)
                assert second.status_code == 202
                second_id = second.json()["job_id"]
                await asyncio.wait_for(workers_started.wait(), 2)
                assert (await client.get("/health")).status_code == 200
                status = (await client.get(f"/csv-jobs/{first_id}")).json()
                assert status["status"] == "running"
                assert status["selected_rows"] == 4
                assert status["completed_rows"] == 0
                assert (await client.get(f"/csv-jobs/{first_id}/result")).status_code == 409
                assert (await client.post("/csv-jobs", content=PAYLOAD)).status_code == 429
                release.set()
                await asyncio.wait_for(asyncio.gather(
                    manager.jobs[first_id].task, manager.jobs[second_id].task
                ), 3)
                assert peak == 2
                status = (await client.get(f"/csv-jobs/{first_id}")).json()
                assert status["status"] == "completed"
                assert status["completed_rows"] == 4
                result = (await client.get(f"/csv-jobs/{first_id}/result")).json()
                assert result["total_rows"] == 5
                assert result["truncated"] is True
                assert [item["parsed"]["case_id"] for item in result["results"]] == [1, 2, 3, 4]
                assert result["results"][0]["source_fields"]["license_plate"] == "ABC-001"
                all_rows = (await client.get(f"/csv-jobs/{second_id}/result")).json()
                assert len(all_rows["results"]) == 5
                assert all_rows["truncated"] is False
                manager.jobs[first_id].finished_at = monotonic() - settings.csv_job_ttl_seconds - 1
                assert (await client.get(f"/csv-jobs/{first_id}")).status_code == 404
                assert (await client.post("/csv-jobs?limit=0", content=PAYLOAD)).status_code == 422
                assert (await client.post("/csv-jobs", content=b" ")).status_code == 400
        await manager.close()

    asyncio.run(scenario())


def test_failed_row_and_timeout_preserve_other_results_and_progress():
    async def scenario():
        settings = Settings(llm_enabled=False, csv_concurrency=3, csv_row_timeout_seconds=0.02)

        async def flaky_parse(case, settings, **kwargs):
            if case.id == 1:
                raise RuntimeError("row failure")
            if case.id == 2:
                await asyncio.sleep(10)
            return parse_with_rules(case)[0], ParseDiagnostics(mode="rules", llm_used=False)

        progress = []
        with patch("app.csv_jobs.parse_case", side_effect=flaky_parse):
            result = await process_csv(
                PAYLOAD, settings, asyncio.Semaphore(3),
                progress=lambda *values: progress.append(values),
            )
        assert [item.parsed.case_id for item in result.results] == [2, 3, 4, 5]
        assert result.results[0].diagnostics.warnings == ["Row timed out; deterministic result returned."]
        assert result.errors[0].row_number == 2
        assert progress[-1] == (5, 5, 5, 1)

    asyncio.run(scenario())


def test_invalid_csv_is_a_reported_job_failure():
    async def scenario():
        manager = JobManager()
        job = manager.submit(b"\xff\xfe", Settings(llm_enabled=False), None)
        await job.task
        assert job.status.status == "failed"
        assert "UTF-8" in job.status.message
        await manager.close()

    asyncio.run(scenario())
