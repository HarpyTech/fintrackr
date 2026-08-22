"""
Structured-output Gemini client for the analytics agent.

Differs from expense_extraction_service.py in three ways that matter:

  1. It asks for JSON via `response_mime_type` + `response_schema` instead of
     asking in prose and regex-scraping the reply. The model is constrained by
     the API rather than by hope.
  2. Every call passes through the per-user LLM rate limiter, so no skill or
     sub-agent can reach the model without being counted.
  3. Calls carry an explicit timeout. The extraction service has none, so a
     hung request there blocks until the platform kills it.

The extraction service is deliberately left untouched; this is additive.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import google.generativeai as genai
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.core.ratelimit import LlmRateLimitError, check_and_record_llm_call

logger = logging.getLogger(__name__)

_GEMINI_MODEL = "gemini-2.5-flash"
_models: dict[str, genai.GenerativeModel] = {}


class GeminiUnavailable(RuntimeError):
    """Gemini is not configured, unreachable, or refused the request."""


class LlmBudgetExhausted(RuntimeError):
    """The per-message model-call budget is spent."""


@dataclass
class LlmBudget:
    """
    Per-request ceiling on model calls.

    The rate limiter caps a user's calls over a time window; this caps a single
    question, so one pathological message cannot consume the whole window.
    """

    max_calls: int = 2
    used: int = 0
    calls: list[str] = field(default_factory=list)

    def spend(self, label: str) -> None:
        if self.used >= self.max_calls:
            raise LlmBudgetExhausted(
                f"model-call budget of {self.max_calls} exhausted"
            )
        self.used += 1
        self.calls.append(label)

    @property
    def remaining(self) -> int:
        return max(0, self.max_calls - self.used)


def is_configured() -> bool:
    """True when Gemini can be called at all."""
    return bool((settings.GEMINI_API_KEY or "").strip())


def _resolve_model_name() -> str:
    model_name = (settings.GEMINI_MODEL or "").strip()
    if not model_name:
        raise GeminiUnavailable("GEMINI_MODEL is not configured")
    if model_name != _GEMINI_MODEL:
        raise GeminiUnavailable(f"GEMINI_MODEL must be set to {_GEMINI_MODEL}")
    return model_name


def _get_model(model_name: str) -> genai.GenerativeModel:
    """Lazily construct and cache the model, mirroring the extraction service."""
    cached = _models.get(model_name)
    if cached is not None:
        return cached

    if not settings.GEMINI_API_KEY:
        raise GeminiUnavailable("GEMINI_API_KEY is not configured")

    genai.configure(api_key=settings.GEMINI_API_KEY)
    instance = genai.GenerativeModel(model_name)
    _models[model_name] = instance
    return instance


def generate_structured(
    prompt: str,
    schema: type[BaseModel],
    *,
    username: str,
    feature: str = "analytics",
    budget: LlmBudget | None = None,
    label: str = "call",
    max_output_tokens: int = 1536,
) -> BaseModel:
    """
    Ask Gemini for a JSON object matching `schema` and return it validated.

    Raises:
        LlmBudgetExhausted  — per-message ceiling reached
        LlmRateLimitError   — per-user window exceeded
        GeminiUnavailable   — not configured, blocked, timed out, or unparseable
        ValidationError     — well-formed JSON that does not match the schema
                              (the caller repairs this, so it is not wrapped)
    """
    if budget is not None:
        budget.spend(label)

    # Counted before the request is made, so a burst of failing calls still
    # consumes allowance and cannot be used to hammer the API.
    check_and_record_llm_call(
        username,
        feature,
        max_calls=settings.ANALYTICS_LLM_CALLS_PER_WINDOW,
        window_minutes=settings.ANALYTICS_LLM_WINDOW_MINUTES,
    )

    model_name = _resolve_model_name()
    model = _get_model(model_name)

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.0,
                candidate_count=1,
                max_output_tokens=max_output_tokens,
            ),
            request_options={"timeout": settings.ANALYTICS_LLM_TIMEOUT_SECONDS},
        )
    except (LlmRateLimitError, LlmBudgetExhausted):
        raise
    except Exception as exc:  # SDK raises a wide variety of transport errors
        logger.warning("Gemini request failed (%s): %s", label, exc)
        raise GeminiUnavailable(f"Gemini request failed: {exc}") from exc

    # finish_reason 2 is SAFETY in the v1beta enum.
    if response.candidates and response.candidates[0].finish_reason == 2:
        raise GeminiUnavailable("Gemini blocked the request")

    raw = (getattr(response, "text", "") or "").strip()
    if not raw:
        raise GeminiUnavailable("Gemini returned an empty response")

    # Let ValidationError propagate: the orchestrator turns it into a repair
    # prompt, which is more useful than a generic failure.
    return schema.model_validate_json(raw)


def describe_last_error(exc: Exception) -> str:
    """Short, user-safe description of a model failure."""
    if isinstance(exc, LlmRateLimitError):
        return "AI request limit reached."
    if isinstance(exc, LlmBudgetExhausted):
        return "This question needed more AI steps than allowed."
    if isinstance(exc, ValidationError):
        return "The AI returned a malformed query."
    return "The AI service is unavailable."
