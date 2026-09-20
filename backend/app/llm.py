import asyncio
import json
import random
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.models import LlmResult
from app.vocabulary import (
    CASE_KIND_VALUES,
    DAMAGE_TYPE_VALUES,
    LIFECYCLE_VALUES,
    SEVERITY_VALUES,
    ZONE_VALUES,
)


def _prompt(
    note: str,
    rule_hints: dict[str, object],
    status_context: dict[str, object],
    severity_evidence: list[dict[str, object]],
) -> str:
    return f"""You extract structured vehicle workshop information from German text.
Return one JSON object only. Do not add markdown.

FIELD-LEVEL EVIDENCE RULES (mandatory):
1. lifecycle: use ONLY STATUS_CONTEXT. Ignore every lifecycle-like statement in
   GERMAN_WORKSHOP_NOTE and SEVERITY_EVIDENCE. A note is historical and may say
   washed, ready, invoiced, postponed, or picked up without representing the
   current database state.
2. overall_severity and each damage severity: use ONLY SEVERITY_EVIDENCE. Do
   not use status, insurance, customer communication, dates, or lifecycle.
   When physical damage is described, make the best supported classification;
   use unknown only when the evidence merely says "damaged" or gives no useful
   physical detail. Calibrate German evidence as follows:
   - minor: feine Kratzspuren, Kratzer im Klarlack, kleine Delle, Schrammen,
     superficial/cosmetic damage.
   - moderate: Kunststoff eingedrückt, Riss im Lack, multiple localized dents,
     meaningful deformation without a torn structural mounting.
   - severe: Aufnahme abgerissen, a torn mounting/attachment, major structural
     deformation, or a clearly expanding safety-critical crack.
   Set overall_severity to the highest supported component severity. If there
   are no damages, overall_severity must be unknown.
3. case_type, case_kind, zones, damage_types, and evidence: use
   GERMAN_WORKSHOP_NOTE plus DETERMINISTIC_HINTS. Never use STATUS_CONTEXT to
   invent vehicle damage.
4. summary_en: summarize the extracted case facts, but do not change any
   classification based on the summary.

Allowed case_type values: damage, service, unknown
Allowed case_kind values: {sorted(CASE_KIND_VALUES)} or null
Allowed zone values: {sorted(ZONE_VALUES)}
Allowed damage_types values: {sorted(DAMAGE_TYPE_VALUES)}
Allowed severity values: {sorted(SEVERITY_VALUES)}
Allowed lifecycle values: {sorted(LIFECYCLE_VALUES)}

Required JSON shape:
{{
  "case_type": "damage|service|unknown",
  "case_kind": "allowed value or null",
  "lifecycle": "allowed value",
  "overall_severity": "minor|moderate|severe|unknown",
  "damages": [
    {{
      "zone": "allowed zone",
      "damage_types": ["allowed damage type"],
      "severity": "minor|moderate|severe|unknown",
      "evidence": "short exact German excerpt or null"
    }}
  ],
  "summary_en": "one short English summary or null"
}}

STATUS_CONTEXT (exclusive source for lifecycle):
{json.dumps(status_context, ensure_ascii=False)}

SEVERITY_EVIDENCE (exclusive source for severity):
{json.dumps(severity_evidence, ensure_ascii=False)}

DETERMINISTIC_HINTS:
{json.dumps(rule_hints, ensure_ascii=False)}

GERMAN_WORKSHOP_NOTE:
{note}
"""


async def parse_with_llm(
    note: str,
    rule_hints: dict[str, object],
    status_context: dict[str, object],
    severity_evidence: list[dict[str, object]],
    settings: Settings,
    client: httpx.AsyncClient | None = None,
) -> LlmResult:
    if not settings.deepseek_api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.llm_model,
        "messages": [
            {
                "role": "system",
                "content": "Extract facts faithfully. Never invent damage or vehicle parts.",
            },
            {
                "role": "user",
                "content": _prompt(
                    note,
                    rule_hints,
                    status_context,
                    severity_evidence,
                ),
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    async def request(active_client: httpx.AsyncClient) -> LlmResult:
        for attempt in range(settings.llm_max_retries + 1):
            response: httpx.Response | None = None
            try:
                response = await active_client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
                content = body["choices"][0]["message"]["content"]
                return LlmResult.model_validate_json(content)
            except (
                httpx.HTTPStatusError,
                httpx.TimeoutException,
                httpx.TransportError,
                ValidationError,
                KeyError,
                ValueError,
            ) as exc:
                retryable = not isinstance(exc, httpx.HTTPStatusError) or (
                    exc.response.status_code in {408, 429} or exc.response.status_code >= 500
                )
                if not retryable or attempt >= settings.llm_max_retries:
                    raise

                delay = settings.llm_retry_base_seconds * (2 ** attempt)
                if response is not None:
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            try:
                                retry_at = parsedate_to_datetime(retry_after)
                                delay = max(
                                    delay,
                                    (retry_at - datetime.now(timezone.utc)).total_seconds(),
                                )
                            except (TypeError, ValueError):
                                pass
                # Jitter prevents all parallel workers from retrying in lockstep.
                await asyncio.sleep(max(0, delay) * random.uniform(0.8, 1.2))

        raise RuntimeError("LLM retry loop ended unexpectedly")

    if client is not None:
        return await request(client)
    async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as local_client:
        return await request(local_client)
