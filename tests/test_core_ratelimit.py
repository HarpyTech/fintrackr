"""Tests for app/core/ratelimit.py — OTP, WebAuthn, and LLM rate limiting."""

import mongomock
import pytest

from app.core import ratelimit
from app.core.ratelimit import (
    LlmRateLimitError,
    OtpRateLimitError,
    WebAuthnRateLimitError,
)


@pytest.fixture
def rl_mongo(monkeypatch):
    """Patch get_users_collection inside the ratelimit module."""
    client = mongomock.MongoClient()
    col = client["testdb"]["users"]
    monkeypatch.setattr(ratelimit, "get_users_collection", lambda: col)
    return col


# ── OTP rate limit ────────────────────────────────────────────────────────────


def test_first_otp_request_succeeds(rl_mongo):
    ratelimit.check_and_record_otp_request("a@b.com")  # must not raise


def test_second_request_under_limit_succeeds(rl_mongo):
    ratelimit.check_and_record_otp_request("a@b.com")
    ratelimit.check_and_record_otp_request("a@b.com")  # 2 of 3 — fine


def test_exceeding_max_attempts_raises_otp(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("a@b.com")
    with pytest.raises(OtpRateLimitError) as exc_info:
        ratelimit.check_and_record_otp_request("a@b.com")
    assert exc_info.value.retry_after_seconds >= 1


def test_different_emails_are_independent(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("x@b.com")
    ratelimit.check_and_record_otp_request("y@b.com")  # different email — fine


def test_clear_otp_attempts_resets_limit(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("a@b.com")
    ratelimit.clear_otp_attempts("a@b.com")
    ratelimit.check_and_record_otp_request("a@b.com")  # must not raise after clear


def test_clear_otp_no_error_if_no_records(rl_mongo):
    ratelimit.clear_otp_attempts("nobody@b.com")  # must not raise


def test_otp_rate_limit_error_attributes():
    err = OtpRateLimitError("Too many requests", retry_after_seconds=120)
    assert err.retry_after_seconds == 120
    assert "Too many requests" in str(err)


def test_otp_oldest_attempt_none_path(rl_mongo, monkeypatch):
    # Force oldest_attempt to return None to exercise the else branch (line 75)
    for _ in range(3):
        ratelimit.check_and_record_otp_request("a@b.com")
    # original_find_one = rl_mongo.database["signup_otp_attempts"].find_one

    def _no_result(*args, **kwargs):
        return None

    monkeypatch.setattr(
        rl_mongo.database["signup_otp_attempts"], "find_one", _no_result
    )
    with pytest.raises(OtpRateLimitError) as exc_info:
        ratelimit.check_and_record_otp_request("a@b.com")
    # Falls back to window_minutes * 60 = 600
    assert exc_info.value.retry_after_seconds == 600


# ── WebAuthn rate limit ───────────────────────────────────────────────────────


def test_webauthn_first_request_succeeds(rl_mongo):
    ratelimit.check_webauthn_rate_limit("u@b.com", "register")


def test_webauthn_under_limit_succeeds(rl_mongo):
    for _ in range(4):
        ratelimit.check_webauthn_rate_limit("u@b.com", "register")


def test_webauthn_exceeding_limit_raises(rl_mongo):
    for _ in range(5):
        ratelimit.check_webauthn_rate_limit("u@b.com", "authenticate")
    with pytest.raises(WebAuthnRateLimitError) as exc_info:
        ratelimit.check_webauthn_rate_limit("u@b.com", "authenticate")
    assert exc_info.value.retry_after_seconds >= 1


def test_webauthn_actions_are_independent(rl_mongo):
    for _ in range(5):
        ratelimit.check_webauthn_rate_limit("u@b.com", "register")
    ratelimit.check_webauthn_rate_limit("u@b.com", "authenticate")  # different action


def test_webauthn_users_are_independent(rl_mongo):
    for _ in range(5):
        ratelimit.check_webauthn_rate_limit("a@b.com", "register")
    ratelimit.check_webauthn_rate_limit("b@b.com", "register")  # different user


def test_webauthn_rate_limit_error_attributes():
    err = WebAuthnRateLimitError("Too many", retry_after_seconds=60)
    assert err.retry_after_seconds == 60
    assert "Too many" in str(err)


def test_webauthn_oldest_none_path(rl_mongo, monkeypatch):
    for _ in range(5):
        ratelimit.check_webauthn_rate_limit("u@b.com", "register")
    monkeypatch.setattr(
        rl_mongo.database["webauthn_attempts"], "find_one", lambda *a, **kw: None
    )
    with pytest.raises(WebAuthnRateLimitError) as exc_info:
        ratelimit.check_webauthn_rate_limit("u@b.com", "register")
    assert exc_info.value.retry_after_seconds == 600


# ── LLM rate limit ────────────────────────────────────────────────────────────


def test_llm_first_call_succeeds(rl_mongo):
    ratelimit.check_and_record_llm_call("u@b.com", "analytics")


def test_llm_under_limit_succeeds(rl_mongo):
    for _ in range(5):
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")


def test_llm_exceeding_limit_raises(rl_mongo):
    for _ in range(20):
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")
    with pytest.raises(LlmRateLimitError) as exc_info:
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")
    assert exc_info.value.retry_after_seconds >= 1


def test_llm_features_are_independent(rl_mongo):
    for _ in range(20):
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")
    ratelimit.check_and_record_llm_call("u@b.com", "extraction")  # different feature


def test_llm_rate_limit_error_attributes():
    err = LlmRateLimitError("AI limit hit", retry_after_seconds=300)
    assert err.retry_after_seconds == 300
    assert "AI limit hit" in str(err)


def test_llm_oldest_none_path(rl_mongo, monkeypatch):
    for _ in range(20):
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")
    monkeypatch.setattr(
        rl_mongo.database["llm_call_attempts"], "find_one", lambda *a, **kw: None
    )
    with pytest.raises(LlmRateLimitError) as exc_info:
        ratelimit.check_and_record_llm_call("u@b.com", "analytics")
    assert exc_info.value.retry_after_seconds == 600


def test_llm_infrastructure_failure_does_not_raise(rl_mongo, monkeypatch):
    # LLM rate limit swallows infrastructure errors (unlike OTP/WebAuthn)
    monkeypatch.setattr(
        ratelimit,
        "get_users_collection",
        lambda: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    ratelimit.check_and_record_llm_call("u@b.com", "analytics")  # must not raise
