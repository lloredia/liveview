from importlib import reload

import shared.tracing as tracing


def test_tracing_prefers_lv_env_for_production_defaults(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("OTEL_TRACES_SAMPLE_RATE", raising=False)

    module = reload(tracing)

    assert module.OTEL_ENV == "production"
    assert module.OTEL_SAMPLE_RATE == 0.1


def test_tracing_normalizes_dev_env_name(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("OTEL_TRACES_SAMPLE_RATE", raising=False)

    module = reload(tracing)

    assert module.OTEL_ENV == "development"
    assert module.OTEL_SAMPLE_RATE == 1.0


def test_tracing_clamps_invalid_sample_rate(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.setenv("OTEL_TRACES_SAMPLE_RATE", "5")

    module = reload(tracing)

    assert module.OTEL_SAMPLE_RATE == 1.0
