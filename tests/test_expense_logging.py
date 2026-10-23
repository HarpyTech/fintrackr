import asyncio

import pytest

from app.api.routes import expenses
from app.services import expense_extraction_service


def test_idempotency_key_is_not_logged(monkeypatch, caplog):
    sentinel = "request-value\nforged-log-entry"
    monkeypatch.setattr(
        expenses, "get_idempotency_response", lambda key, user: {"cached": True}
    )

    with caplog.at_level("INFO"):
        result = asyncio.run(
            expenses.extract_and_create_expense(
                user="user@example.com",
                tenant_id="tenant",
                idempotency_key=sentinel,
            )
        )

    assert result == {"cached": True}
    assert "Returning cached expense response" in caplog.text
    assert sentinel not in caplog.text
    assert "forged-log-entry" not in caplog.text


def test_model_output_is_not_logged(caplog):
    sentinel = "model-value\nforged-log-entry"

    with pytest.raises(RuntimeError, match="Could not find a JSON object"):
        expense_extraction_service._parse_json_from_model(sentinel)

    assert sentinel not in caplog.text
    assert "forged-log-entry" not in caplog.text
