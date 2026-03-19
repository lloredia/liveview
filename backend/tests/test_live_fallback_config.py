from importlib import reload

import api.live_fallback as live_fallback


def test_tsdb_key_uses_demo_default_only_outside_production(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.delenv("LV_THESPORTSDB_API_KEY", raising=False)
    monkeypatch.delenv("THESPORTSDB_API_KEY", raising=False)
    monkeypatch.delenv("LV_THESPORTSDB_API_KEY", raising=False)

    module = reload(live_fallback)
    module.get_settings.cache_clear()

    assert module._get_tsdb_key() == "3"


def test_tsdb_key_is_empty_in_production_without_configuration(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.delenv("LV_THESPORTSDB_API_KEY", raising=False)
    monkeypatch.delenv("THESPORTSDB_API_KEY", raising=False)

    module = reload(live_fallback)
    module.get_settings.cache_clear()

    assert module._get_tsdb_key() == ""


def test_tsdb_key_prefers_shared_settings_config(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.setenv("LV_THESPORTSDB_API_KEY", "configured-key")
    monkeypatch.delenv("THESPORTSDB_API_KEY", raising=False)

    module = reload(live_fallback)
    module.get_settings.cache_clear()

    assert module._get_tsdb_key() == "configured-key"
