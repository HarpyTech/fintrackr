"""Tests for app/core/security.py — hashing, JWT, CSRF utilities."""

from app.core import security


def test_hash_password_returns_string():
    hashed = security.hash_password("mysecretpassword")
    assert isinstance(hashed, str)
    assert len(hashed) > 0


def test_verify_password_correct():
    hashed = security.hash_password("correct")
    assert security.verify_password("correct", hashed) is True


def test_verify_password_incorrect():
    hashed = security.hash_password("correct")
    assert security.verify_password("wrong", hashed) is False


def test_hash_password_different_each_time():
    h1 = security.hash_password("same")
    h2 = security.hash_password("same")
    assert h1 != h2  # bcrypt uses random salt


def test_create_access_token_returns_string():
    token = security.create_access_token({"username": "u@b.com", "role": "user"})
    assert isinstance(token, str)
    assert token.count(".") == 2  # JWT format: header.payload.signature


def test_create_access_token_can_be_decoded():
    from jose import jwt
    from app.core.config import settings

    token = security.create_access_token({"username": "u@b.com"})
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["username"] == "u@b.com"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_create_refresh_token_type():
    token = security.create_refresh_token({"username": "u@b.com"})
    payload = security.decode_refresh_token(token)
    assert payload is not None
    assert payload["type"] == "refresh"
    assert payload["username"] == "u@b.com"


def test_decode_refresh_token_rejects_access_token():
    access = security.create_access_token({"username": "u@b.com"})
    assert security.decode_refresh_token(access) is None


def test_decode_refresh_token_rejects_garbage():
    assert security.decode_refresh_token("not.a.token") is None
    assert security.decode_refresh_token("") is None


def test_hash_token_is_deterministic():
    h = security.hash_token("sometoken")
    assert security.hash_token("sometoken") == h


def test_hash_token_length():
    h = security.hash_token("x")
    assert len(h) == 64  # SHA-256 hex digest


def test_hash_token_different_for_different_inputs():
    assert security.hash_token("aaa") != security.hash_token("bbb")


def test_create_csrf_token_is_string():
    token = security.create_csrf_token()
    assert isinstance(token, str)
    assert len(token) > 16
