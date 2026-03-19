import os

from auth_routes import _get_database_url
from shared.config import Settings


def test_settings_prefers_database_url_in_production_when_lv_url_is_placeholder(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.setenv("LV_DATABASE_URL", "postgresql+asyncpg://liveview:liveview@postgres:5432/liveview")
    monkeypatch.setenv("DATABASE_URL", "postgresql://real_user:real_pass@real-host:5432/real_db")
    monkeypatch.delenv("POSTGRES_URL", raising=False)

    settings = Settings()

    assert settings.database_url_str == "postgresql+asyncpg://real_user:real_pass@real-host:5432/real_db"


def test_settings_keeps_explicit_lv_database_url_outside_production(monkeypatch):
    monkeypatch.setenv("LV_ENV", "dev")
    monkeypatch.setenv("LV_DATABASE_URL", "postgresql+asyncpg://custom_user:custom_pass@custom-host:5432/custom_db")
    monkeypatch.setenv("DATABASE_URL", "postgresql://real_user:real_pass@real-host:5432/real_db")
    monkeypatch.delenv("POSTGRES_URL", raising=False)

    settings = Settings()

    assert settings.database_url_str == "postgresql+asyncpg://custom_user:custom_pass@custom-host:5432/custom_db"


def test_auth_routes_uses_same_database_url_resolution(monkeypatch):
    monkeypatch.setenv("LV_ENV", "production")
    monkeypatch.setenv("LV_DATABASE_URL", "postgresql+asyncpg://liveview:liveview@postgres:5432/liveview")
    monkeypatch.setenv("DATABASE_URL", "postgresql://real_user:real_pass@real-host:5432/real_db")
    monkeypatch.delenv("POSTGRES_URL", raising=False)

    assert _get_database_url() == "postgresql://real_user:real_pass@real-host:5432/real_db"
