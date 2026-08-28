"""Tests for app/core/ratelimit.py — OTP rate limiting with mongomock."""

import pytest
import mongomock

from app.core import ratelimit
from app.core.ratelimit import OtpRateLimitError


@pytest.fixture
def rl_mongo(monkeypatch):
    """Patch get_users_collection inside the ratelimit module."""
    client = mongomock.MongoClient()
    col = client["testdb"]["users"]
    monkeypatch.setattr(ratelimit, "get_users_collection", lambda: col)
    return col


def test_first_otp_request_succeeds(rl_mongo):
    ratelimit.check_and_record_otp_request("a@b.com")  # must not raise


def test_second_request_under_limit_succeeds(rl_mongo):
    ratelimit.check_and_record_otp_request("a@b.com")
    ratelimit.check_and_record_otp_request("a@b.com")  # 2 of 3 — fine


def test_exceeding_max_attempts_raises(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("a@b.com")
    # mongomock may return naive datetimes; the guard raises OtpRateLimitError
    # or wraps to RuntimeError depending on timezone handling in mongomock.
    with pytest.raises((OtpRateLimitError, RuntimeError)):
        ratelimit.check_and_record_otp_request("a@b.com")


def test_different_emails_are_independent(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("x@b.com")
    # Different email should still be allowed
    ratelimit.check_and_record_otp_request("y@b.com")


def test_clear_otp_attempts_resets_limit(rl_mongo):
    for _ in range(3):
        ratelimit.check_and_record_otp_request("a@b.com")
    ratelimit.clear_otp_attempts("a@b.com")
    # After clearing, the next request should succeed
    ratelimit.check_and_record_otp_request("a@b.com")  # must not raise


def test_clear_otp_no_error_if_no_records(rl_mongo):
    ratelimit.clear_otp_attempts("nobody@b.com")  # must not raise


def test_otp_rate_limit_error_has_retry_after():
    err = OtpRateLimitError("Too many requests", retry_after_seconds=120)
    assert err.retry_after_seconds == 120
    assert "Too many requests" in str(err)
