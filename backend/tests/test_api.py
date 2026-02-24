"""API route tests. Health endpoint tested without DB/Redis; other routes require running services."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.app import create_app


@pytest.fixture
def client() -> TestClient:
    """Test client with lifespan disabled so /health can be tested without DB/Redis."""
    app = create_app(use_lifespan=False)
    with TestClient(app) as c:
        yield c


def test_health_returns_ok(client: TestClient) -> None:
    """GET /health returns 200 and status ok."""
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert data.get("service") == "api"


def test_health_returns_json(client: TestClient) -> None:
    """GET /health returns application/json."""
    r = client.get("/health")
    assert r.headers.get("content-type", "").startswith("application/json")
