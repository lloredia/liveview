from shared.utils.health_server import _resolve_health_port


def test_health_server_prefers_runtime_port(monkeypatch):
    monkeypatch.setenv("PORT", "18000")
    monkeypatch.setenv("LV_API_PORT", "19000")

    assert _resolve_health_port() == 18000


def test_health_server_falls_back_to_lv_api_port(monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("LV_API_PORT", "19000")

    assert _resolve_health_port() == 19000


def test_health_server_ignores_invalid_port(monkeypatch):
    monkeypatch.setenv("PORT", "not-a-port")
    monkeypatch.delenv("LV_API_PORT", raising=False)

    assert _resolve_health_port() is None
