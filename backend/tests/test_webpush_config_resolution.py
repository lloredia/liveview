from notifications.deliver_webpush import _get_vapid_config


def test_webpush_prefers_primary_vapid_env_names(monkeypatch):
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "primary-key")
    monkeypatch.setenv("VAPID_CLAIM_EMAIL", "mailto:primary@example.com")
    monkeypatch.setenv("LV_VAPID_PRIVATE_KEY", "legacy-key")
    monkeypatch.setenv("LV_VAPID_CLAIM_EMAIL", "mailto:legacy@example.com")

    config = _get_vapid_config()

    assert config["private_key"] == "primary-key"
    assert config["claims"]["sub"] == "mailto:primary@example.com"


def test_webpush_falls_back_to_legacy_vapid_env_names(monkeypatch):
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("VAPID_CLAIM_EMAIL", raising=False)
    monkeypatch.setenv("LV_VAPID_PRIVATE_KEY", "legacy-key")
    monkeypatch.setenv("LV_VAPID_CLAIM_EMAIL", "mailto:legacy@example.com")

    config = _get_vapid_config()

    assert config["private_key"] == "legacy-key"
    assert config["claims"]["sub"] == "mailto:legacy@example.com"
