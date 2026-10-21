import json

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def _parse(body: str) -> dict:
    prefix = "window.__APP_CONFIG__ = "
    assert body.startswith(prefix)
    return json.loads(body[len(prefix):].strip().rstrip(";"))


def test_runtime_config_serves_public_flags():
    response = TestClient(app).get("/runtime-config.js")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/javascript")
    assert response.headers["cache-control"] == "no-store"
    assert set(_parse(response.text)) == {
        "featureSupportPageEnabled",
        "featureBillingEnabled",
        "featureAdminEnabled",
        "supportEmail",
    }


def test_runtime_config_reflects_settings(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_BILLING_ENABLED", True)
    monkeypatch.setattr(settings, "SUPPORT_EMAIL", "help@example.com")

    config = _parse(TestClient(app).get("/runtime-config.js").text)

    assert config["featureBillingEnabled"] is True
    assert config["supportEmail"] == "help@example.com"


def test_runtime_config_never_exposes_secrets():
    body = TestClient(app).get("/runtime-config.js").text

    assert settings.SECRET_KEY not in body
    assert settings.MONGODB_URI not in body
