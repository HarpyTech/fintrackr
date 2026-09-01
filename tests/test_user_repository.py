"""Tests for app/repositories/user_repository.py — mongomock-backed."""

import pytest
import mongomock
from bson import ObjectId

from app.repositories import user_repository


@pytest.fixture
def users_col(monkeypatch):
    client = mongomock.MongoClient()
    col = client["testdb"]["users"]
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: col)
    return col


def test_find_by_username_found(users_col):
    users_col.insert_one({"username": "a@b.com", "role": "user"})
    result = user_repository.find_by_username("a@b.com")
    assert result is not None
    assert result["username"] == "a@b.com"


def test_find_by_username_not_found(users_col):
    assert user_repository.find_by_username("ghost@b.com") is None


def test_create_inserts_and_returns_string_id(users_col):
    doc_id = user_repository.create({"username": "new@b.com", "role": "user"})
    assert isinstance(doc_id, str)
    assert len(doc_id) == 24  # ObjectId hex
    assert users_col.find_one({"username": "new@b.com"}) is not None


def test_update_by_username_matched(users_col):
    users_col.insert_one({"username": "u@b.com", "role": "user"})
    matched = user_repository.update_by_username("u@b.com", {"role": "admin"})
    assert matched is True
    doc = users_col.find_one({"username": "u@b.com"})
    assert doc["role"] == "admin"


def test_update_by_username_not_found(users_col):
    matched = user_repository.update_by_username("ghost@b.com", {"role": "admin"})
    assert matched is False


def test_update_by_id_set_only(users_col):
    result = users_col.insert_one({"username": "u@b.com", "plan": "free"})
    oid = result.inserted_id
    updated = user_repository.update_by_id(oid, set_fields={"plan": "go"})
    assert updated is True
    doc = users_col.find_one({"_id": oid})
    assert doc["plan"] == "go"


def test_update_by_id_with_unset(users_col):
    result = users_col.insert_one({"username": "u@b.com", "temp": "value", "plan": "free"})
    oid = result.inserted_id
    user_repository.update_by_id(
        oid, set_fields={"plan": "go"}, unset_fields={"temp": ""}
    )
    doc = users_col.find_one({"_id": oid})
    assert "temp" not in doc
    assert doc["plan"] == "go"


def test_update_by_id_no_match_returns_false(users_col):
    result = user_repository.update_by_id(ObjectId(), set_fields={"plan": "go"})
    assert result is False
