from shared.utils.metrics import resolve_metrics_port


def test_metrics_port_prefers_service_specific_env(monkeypatch):
    monkeypatch.setenv("LV_INGEST_METRICS_PORT", "9191")
    monkeypatch.setenv("LV_METRICS_PORT", "9090")

    assert resolve_metrics_port(9091, "LV_INGEST_METRICS_PORT") == 9191


def test_metrics_port_falls_back_to_shared_env(monkeypatch):
    monkeypatch.delenv("LV_INGEST_METRICS_PORT", raising=False)
    monkeypatch.setenv("LV_METRICS_PORT", "9090")

    assert resolve_metrics_port(9091, "LV_INGEST_METRICS_PORT") == 9090


def test_metrics_port_uses_default_on_invalid_env(monkeypatch):
    monkeypatch.setenv("LV_INGEST_METRICS_PORT", "not-a-port")
    monkeypatch.delenv("LV_METRICS_PORT", raising=False)

    assert resolve_metrics_port(9091, "LV_INGEST_METRICS_PORT") == 9091
