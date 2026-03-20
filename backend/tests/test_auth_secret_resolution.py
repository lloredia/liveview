from auth.deps import _get_jwt_secret
from auth_routes import _is_production, create_token, decode_token


def test_auth_secret_uses_lv_jwt_secret_when_auth_secret_missing(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    monkeypatch.setenv("LV_JWT_SECRET", "lv-secret")
    monkeypatch.delenv("JWT_SECRET", raising=False)

    assert _get_jwt_secret() == "lv-secret"


def test_auth_secret_prefers_auth_jwt_secret(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.setenv("AUTH_JWT_SECRET", "auth-secret")
    monkeypatch.setenv("LV_JWT_SECRET", "lv-secret")
    monkeypatch.setenv("JWT_SECRET", "jwt-secret")

    assert _get_jwt_secret() == "auth-secret"


def test_auth_routes_and_deps_share_secret_resolution(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    monkeypatch.delenv("LV_JWT_SECRET", raising=False)
    monkeypatch.setenv("JWT_SECRET", "jwt-secret")

    token = create_token("123e4567-e89b-12d3-a456-426614174000", "user@example.com")
    payload = decode_token(token)

    assert _get_jwt_secret() == "jwt-secret"
    assert payload is not None
    assert payload["sub"] == "123e4567-e89b-12d3-a456-426614174000"


def test_auth_routes_detects_production_from_lv_env(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.delenv("ENVIRONMENT", raising=False)

    assert _is_production() is True


def test_auth_routes_detects_production_from_environment_fallback(monkeypatch):
    monkeypatch.delenv("LV_ENV", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    assert _is_production() is True
