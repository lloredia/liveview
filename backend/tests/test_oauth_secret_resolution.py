from api.routes.auth_routes import _get_oauth_secret


def test_oauth_secret_prefers_lv_secret(monkeypatch):
    monkeypatch.setenv("LV_OAUTH_ENSURE_SECRET", "lv-secret")
    monkeypatch.setenv("OAUTH_ENSURE_SECRET", "legacy-secret")

    assert _get_oauth_secret() == "lv-secret"


def test_oauth_secret_falls_back_to_legacy_name(monkeypatch):
    monkeypatch.delenv("LV_OAUTH_ENSURE_SECRET", raising=False)
    monkeypatch.setenv("OAUTH_ENSURE_SECRET", "legacy-secret")

    assert _get_oauth_secret() == "legacy-secret"
