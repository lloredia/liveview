from api.service import _resolve_api_bind_port


def test_api_service_prefers_runtime_port(monkeypatch):
    monkeypatch.setenv("PORT", "18000")
    monkeypatch.setenv("LV_API_PORT", "19000")

    assert _resolve_api_bind_port(8000) == 18000


def test_api_service_falls_back_to_lv_api_port(monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("LV_API_PORT", "19000")

    assert _resolve_api_bind_port(8000) == 19000


def test_api_service_ignores_invalid_runtime_port(monkeypatch):
    monkeypatch.setenv("PORT", "not-a-port")
    monkeypatch.delenv("LV_API_PORT", raising=False)

    assert _resolve_api_bind_port(8000) == 8000
