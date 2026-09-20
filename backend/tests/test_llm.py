import asyncio

import httpx

from app.config import Settings
from app.llm import parse_with_llm


def _settings(**overrides):
    return Settings(
        deepseek_api_key="test-key",
        llm_max_retries=2,
        llm_retry_base_seconds=0,
        **overrides,
    )


def _success_response():
    return {
        "choices": [
            {
                "message": {
                    "content": '{"case_type":"damage","lifecycle":"unknown",'
                    '"overall_severity":"minor","damages":[],"summary_en":null}'
                }
            }
        ]
    }


def test_retries_rate_limit_then_succeeds():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(429, headers={"Retry-After": "0"}, request=request)
        return httpx.Response(200, json=_success_response(), request=request)

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await parse_with_llm("Motorhaube verkratzt", {}, {}, [], _settings(), client)
        assert result.case_type == "damage"
        assert attempts == 3

    asyncio.run(scenario())


def test_retries_malformed_model_response_then_succeeds():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        body = {"choices": [{"message": {"content": "not-json"}}]}
        if attempts == 2:
            body = _success_response()
        return httpx.Response(200, json=body, request=request)

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await parse_with_llm("Motorhaube verkratzt", {}, {}, [], _settings(), client)
        assert result.case_type == "damage"
        assert attempts == 2

    asyncio.run(scenario())


def test_does_not_retry_non_transient_client_error():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(401, request=request)

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            try:
                await parse_with_llm("Motorhaube verkratzt", {}, {}, [], _settings(), client)
            except httpx.HTTPStatusError:
                pass
            else:
                raise AssertionError("Expected HTTPStatusError")
        assert attempts == 1

    asyncio.run(scenario())
