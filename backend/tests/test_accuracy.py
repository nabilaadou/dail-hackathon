import asyncio
import json
import os

import pytest

from app.config import Settings
from app.parser import parse_case, parse_with_rules
from tests.accuracy import load_ground_truth, load_unlabelled_cases, score_predictions


def test_rule_parser_accuracy_on_all_dataset_rows() -> None:
    cases = load_unlabelled_cases()
    expected = load_ground_truth()
    predictions = [parse_with_rules(case)[0] for case in cases]

    report = score_predictions(predictions, expected)
    print(f"\nDeterministic accuracy: {json.dumps(report.as_dict(), indent=2)}")

    assert report.row_count == 1000
    assert report.case_type >= 0.89
    assert report.case_kind >= 0.89
    assert report.lifecycle >= 0.84
    assert report.zones >= 0.97


@pytest.mark.live_llm
@pytest.mark.slow
def test_live_llm_accuracy_on_all_dataset_rows() -> None:
    if os.getenv("RUN_LIVE_LLM_TESTS") != "1":
        pytest.skip("Set RUN_LIVE_LLM_TESTS=1 to benchmark the live LLM")

    settings = Settings()
    if not settings.llm_enabled or not settings.deepseek_api_key:
        pytest.fail("The live benchmark requires LLM_ENABLED and DEEPSEEK_API_KEY")

    cases = load_unlabelled_cases()
    expected = load_ground_truth()
    concurrency = int(os.getenv("LLM_TEST_CONCURRENCY", "12"))

    async def run_all() -> tuple[list, int]:
        semaphore = asyncio.Semaphore(concurrency)

        first_prediction, first_diagnostics = await parse_case(cases[0], settings)
        if not first_diagnostics.llm_used:
            pytest.fail(
                "Live LLM preflight failed: " + "; ".join(first_diagnostics.warnings)
            )

        async def parse_one(case):
            async with semaphore:
                return await parse_case(case, settings)

        results = await asyncio.gather(*(parse_one(case) for case in cases[1:]))
        return [first_prediction, *(parsed for parsed, _ in results)], 1 + sum(
            diagnostics.llm_used for _, diagnostics in results
        )

    predictions, llm_successes = asyncio.run(run_all())
    report = score_predictions(predictions, expected)
    print(
        "\nLive LLM accuracy: "
        + json.dumps(
            {**report.as_dict(), "llm_successes": llm_successes}, indent=2
        )
    )

    assert llm_successes >= int(report.row_count * 0.95)
    assert report.case_type >= 0.89
    assert report.case_kind >= 0.89
    assert report.lifecycle >= 0.84
    assert report.zones >= 0.97
    assert report.severity >= 0.70
