from notifications.apns import _get_config as get_runtime_apns_config
from notifications.apns import is_configured as runtime_apns_is_configured
from notifications.deliver_apns import _is_configured as delivery_apns_is_configured


def test_apns_runtime_and_delivery_accept_primary_apns_env_names(monkeypatch):
    monkeypatch.setenv("APNS_TEAM_ID", "TEAM123456")
    monkeypatch.setenv("APNS_KEY_ID", "KEY1234567")
    monkeypatch.setenv("APNS_BUNDLE_ID", "com.liveview.tracker")
    monkeypatch.setenv("APNS_P8_PRIVATE_KEY_BASE64", "cHJpdmF0ZS1rZXk=")
    monkeypatch.setenv("APNS_USE_SANDBOX", "false")
    monkeypatch.delenv("LV_APNS_TEAM_ID", raising=False)
    monkeypatch.delenv("LV_APNS_KEY_ID", raising=False)
    monkeypatch.delenv("LV_APNS_BUNDLE_ID", raising=False)
    monkeypatch.delenv("LV_APNS_P8_PRIVATE_KEY", raising=False)

    config = get_runtime_apns_config()

    assert runtime_apns_is_configured() is True
    assert delivery_apns_is_configured() is True
    assert config["team_id"] == "TEAM123456"
    assert config["key_id"] == "KEY1234567"
    assert config["bundle_id"] == "com.liveview.tracker"
    assert config["private_key"] == "private-key"
    assert config["use_sandbox"] is False


def test_apns_runtime_and_delivery_accept_legacy_lv_env_names(monkeypatch):
    monkeypatch.delenv("APNS_TEAM_ID", raising=False)
    monkeypatch.delenv("APNS_KEY_ID", raising=False)
    monkeypatch.delenv("APNS_BUNDLE_ID", raising=False)
    monkeypatch.delenv("APNS_P8_PRIVATE_KEY_BASE64", raising=False)
    monkeypatch.delenv("APNS_USE_SANDBOX", raising=False)
    monkeypatch.setenv("LV_APNS_TEAM_ID", "TEAM123456")
    monkeypatch.setenv("LV_APNS_KEY_ID", "KEY1234567")
    monkeypatch.setenv("LV_APNS_BUNDLE_ID", "com.liveview.tracker")
    monkeypatch.setenv("LV_APNS_P8_PRIVATE_KEY", "bGVnYWN5LWtleQ==")
    monkeypatch.setenv("LV_APNS_USE_SANDBOX", "true")

    config = get_runtime_apns_config()

    assert runtime_apns_is_configured() is True
    assert delivery_apns_is_configured() is True
    assert config["private_key"] == "legacy-key"
    assert config["use_sandbox"] is True
