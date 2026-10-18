"""Shared test fixtures.

SECRET_KEY is set before any app module import so that
``app.core.config.Settings`` loads without a real environment.
"""

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-chars-long-xyz")

import mongomock
import pytest


@pytest.fixture
def mongo(monkeypatch):
    """Patch the Mongo collection getters to use an in-memory mongomock DB."""
    client = mongomock.MongoClient()
    db = client["testdb"]
    users = db["users"]
    expenses = db["expenses"]
    line_items = db["expense_line_items"]

    import app.db.mongo as db_module
    import app.services.admin_service as admin_service
    import app.services.expense_service as expense_service

    for module in (db_module, admin_service, expense_service):
        monkeypatch.setattr(
            module, "get_users_collection", lambda: users, raising=False
        )
        monkeypatch.setattr(
            module, "get_expenses_collection", lambda: expenses, raising=False
        )
        monkeypatch.setattr(
            module,
            "get_expense_line_items_collection",
            lambda: line_items,
            raising=False,
        )
        monkeypatch.setattr(
            module, "get_mongo_client", lambda: client, raising=False
        )

    return {"users": users, "expenses": expenses, "line_items": line_items}
