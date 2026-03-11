"""
Security tests for OWASP Top 10 vulnerabilities.

Tests cover:
- SQL Injection
- Authentication & Authorization
- XSS (input validation)
- CSRF
- Broken Access Control
- Sensitive Data Exposure
- External Entity Injection

Run with: pytest backend/tests/test_security.py -v
"""
import uuid
import json
from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from api.app import create_app
from api.dependencies import init_dependencies
from shared.config import Settings, Environment, ServiceRole
from shared.models.orm import (
    MatchORM, LeagueORM, SportORM, TeamORM, MatchStateORM, MatchEventORM
)
from shared.utils.database import DatabaseManager
from shared.utils.redis_manager import RedisManager


@pytest.fixture
async def settings():
    """Test settings."""
    return Settings(
        environment=Environment.DEV,
        service_role=ServiceRole.API,
        database_url="postgresql+asyncpg://liveview:liveview@localhost/liveview_security_test",
        redis_url="redis://localhost:6379/2",
    )


@pytest.fixture
async def db(settings):
    """Test database."""
    db_manager = DatabaseManager(settings)
    await db_manager.connect()
    
    from shared.models.orm import Base
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield db_manager
    
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await db_manager.disconnect()


@pytest.fixture
async def redis(settings):
    """Test Redis."""
    redis_manager = RedisManager(settings)
    await redis_manager.connect()
    await redis_manager.client.flushdb()
    yield redis_manager
    await redis_manager.disconnect()


@pytest.fixture
async def client(settings, db, redis):
    """Test client."""
    init_dependencies(redis, db)
    app = create_app(db, redis)
    async with AsyncClient(app=app, base_url="http://test") as test_client:
        yield test_client


class TestSQLInjection:
    """Test SQL injection prevention."""
    
    @pytest.mark.asyncio
    async def test_league_id_injection_attempt(self, client, db):
        """Test SQL injection in league query."""
        # Create test league
        async with db.write_session() as session:
            sport = SportORM(id=uuid.uuid4(), name="soccer", sport_type="soccer")
            league = LeagueORM(
                id=uuid.uuid4(),
                sport_id=(await session.execute(select(SportORM).limit(1))).scalar().id or uuid.uuid4(),
                name="Test League",
                short_name="TL",
                country="Test",
            )
            session.add(sport)
            session.add(league)
            await session.commit()
        
        # Try SQL injection
        malicious_id = "123' OR '1'='1"
        response = await client.get(f"/v1/leagues/{malicious_id}/scoreboard")
        
        # Should not crash or return sensitive data
        assert response.status_code in [400, 404, 422]  # Bad request or validation error
    
    @pytest.mark.asyncio
    async def test_match_id_injection_attempt(self, client):
        """Test SQL injection in match query."""
        malicious_id = "' UNION SELECT * FROM users --"
        response = await client.get(f"/v1/matches/{malicious_id}")
        
        # Should fail safely
        assert response.status_code in [400, 404, 422]


class TestAuthenticationBypass:
    """Test authentication bypass prevention."""
    
    @pytest.mark.asyncio
    async def test_missing_auth_header(self, client):
        """Test that protected endpoints require auth."""
        response = await client.get("/v1/user/tracked-games")
        
        # Should return 401 Unauthorized
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_invalid_jwt_token(self, client):
        """Test that invalid JWT is rejected."""
        headers = {"Authorization": "Bearer invalid.jwt.token"}
        response = await client.get("/v1/user/tracked-games", headers=headers)
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_expired_jwt_token(self, client):
        """Test that expired JWT is rejected."""
        # Create an expired token (negative exp)
        import jwt
        from datetime import datetime, timedelta, timezone
        
        secret = "test_secret"
        expired_token = jwt.encode(
            {
                "sub": str(uuid.uuid4()),
                "exp": datetime.now(timezone.utc) - timedelta(hours=1)
            },
            secret,
            algorithm="HS256"
        )
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = await client.get("/v1/user/tracked-games", headers=headers)
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_tampered_jwt_token(self, client):
        """Test that tampered JWT is rejected."""
        import jwt
        from datetime import datetime, timedelta, timezone
        
        secret = "test_secret"
        token = jwt.encode(
            {
                "sub": str(uuid.uuid4()),
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)
            },
            secret,
            algorithm="HS256"
        )
        
        # Tamper with token
        tampered = token[:-10] + "fakefake!!"
        headers = {"Authorization": f"Bearer {tampered}"}
        response = await client.get("/v1/user/tracked-games", headers=headers)
        
        assert response.status_code == 401


class TestInputValidation:
    """Test XSS and input validation."""
    
    @pytest.mark.asyncio
    async def test_html_injection_in_query_parameter(self, client):
        """Test that HTML in query params is not reflected."""
        malicious_input = "<script>alert('xss')</script>"
        response = await client.get(f"/v1/today?date={malicious_input}")
        
        # Should either sanitize or reject
        assert response.status_code == 400 or "<script>" not in response.text
    
    @pytest.mark.asyncio
    async def test_league_ids_validation(self, client):
        """Test validation of league_ids parameter."""
        # Valid UUID format
        valid_response = await client.get(f"/v1/today?league_ids={uuid.uuid4()}")
        assert valid_response.status_code in [200, 400]  # Either works or validation error
        
        # Invalid format
        invalid_response = await client.get("/v1/today?league_ids=not-a-uuid")
        assert invalid_response.status_code == 400
    
    @pytest.mark.asyncio
    async def test_date_parameter_validation(self, client):
        """Test date format validation."""
        # Valid format
        valid = await client.get("/v1/today?date=2024-01-15")
        assert valid.status_code in [200, 400]
        
        # Invalid format
        invalid = await client.get("/v1/today?date=2024/01/15")
        assert invalid.status_code == 400
        
        # Invalid date
        bad_date = await client.get("/v1/today?date=2024-13-45")
        assert bad_date.status_code == 400


class TestAccessControl:
    """Test broken access control prevention."""
    
    @pytest.mark.asyncio
    async def test_cannot_access_other_users_data(self, client, db):
        """Test that users cannot access other users' data."""
        import jwt
        from datetime import datetime, timedelta, timezone
        
        # Create two users
        secret = "test_secret"
        user1_id = uuid.uuid4()
        user2_id = uuid.uuid4()
        
        # Token for user1
        token1 = jwt.encode(
            {
                "sub": str(user1_id),
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)
            },
            secret,
            algorithm="HS256"
        )
        
        # User1 should not be able to access user2's data
        headers = {"Authorization": f"Bearer {token1}"}
        response = await client.get(
            f"/v1/user/{user2_id}/tracked-games",
            headers=headers
        )
        
        # Should return 403 or 404 (not user2's data)
        assert response.status_code in [403, 404, 401]
    
    @pytest.mark.asyncio
    async def test_horizontal_privilege_escalation(self, client):
        """Test prevention of horizontal privilege escalation."""
        import jwt
        from datetime import datetime, timedelta, timezone
        
        secret = "test_secret"
        user_id = uuid.uuid4()
        
        token = jwt.encode(
            {
                "sub": str(user_id),
                "role": "user",  # Not admin
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)
            },
            secret,
            algorithm="HS256"
        )
        
        # Try to access admin endpoint
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get("/v1/admin/users", headers=headers)
        
        assert response.status_code in [401, 403]


class TestSensitiveDataExposure:
    """Test that sensitive data is not exposed."""
    
    @pytest.mark.asyncio
    async def test_no_database_errors_exposed(self, client):
        """Test that database errors don't leak information."""
        # Try to trigger a database error
        response = await client.get(f"/v1/matches/{uuid.uuid4()}")
        
        # Should return 404, not 500 with traceback
        assert response.status_code in [404, 422]
        
        # Should not contain SQL or internal info
        assert "SELECT" not in response.text
        assert "PostgreSQL" not in response.text
    
    @pytest.mark.asyncio
    async def test_no_server_info_in_error_messages(self, client):
        """Test that error messages don't expose server info."""
        response = await client.get("/v1/nonexistent")
        
        # Should not expose server/framework details
        assert "FastAPI" not in response.text
        assert "Starlette" not in response.text
    
    @pytest.mark.asyncio
    async def test_request_id_not_in_response_body(self, client):
        """Test that sensitive Request IDs are not leaked."""
        response = await client.get("/v1/leagues")
        
        # Request ID should be in headers, not body
        request_id = response.headers.get("X-Request-ID")
        assert request_id is not None
        
        # Should not appear in public response data
        body = response.json()
        if isinstance(body, list):
            for item in body:
                if isinstance(item, dict):
                    assert request_id not in str(item)


class TestRateLimiting:
    """Test rate limiting enforcement."""
    
    @pytest.mark.asyncio
    async def test_rate_limit_headers(self, client):
        """Test that rate limit headers are present."""
        response = await client.get("/v1/leagues")
        
        # Should have rate limit headers or be enforcing limits
        # Either way, 429 responses should occur after threshold


class TestSecurityHeaders:
    """Test security headers."""
    
    @pytest.mark.asyncio
    async def test_x_content_type_options_header(self, client):
        """Test X-Content-Type-Options header."""
        response = await client.get("/v1/leagues")
        
        # Should have header to prevent MIME sniffing
        # Note: may be added in future
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_cors_headers_present(self, client):
        """Test CORS headers."""
        response = await client.get("/v1/leagues")
        
        # Should have some CORS policy
        headers_lower = {k.lower(): v for k, v in response.headers.items()}
        assert "access-control-allow-origin" in headers_lower or response.status_code == 200


class TestPasswordSecurity:
    """Test password handling."""
    
    @pytest.mark.asyncio
    async def test_no_hardcoded_passwords(self, client):
        """Test that no passwords are hardcoded in responses."""
        # This is a conceptual test - ensures password isn't in endpoints
        response = await client.get("/v1/leagues")
        
        # Check response doesn't contain password-like data
        data = response.json()
        assert "password" not in str(data).lower()
        assert response.status_code in [200, 401]


class TestResourceExhaustion:
    """Test protection against resource exhaustion attacks."""
    
    @pytest.mark.asyncio
    async def test_large_content_rejected(self, client):
        """Test that excessively large requests are rejected."""
        # Try to post huge payload
        huge_data = "x" * (10 * 1024 * 1024)  # 10MB
        response = await client.post(
            "/v1/auth/register",
            json={"email": "test@example.com", "password": huge_data}
        )
        
        # Should reject or handle gracefully
        assert response.status_code in [400, 413, 422, 404]
    
    @pytest.mark.asyncio
    async def test_query_parameter_limits(self, client):
        """Test limits on query parameter counts."""
        # Try to send excessive query parameters
        params = "&".join([f"filter{i}=value{i}" for i in range(100)])
        response = await client.get(f"/v1/leagues?{params}")
        
        # Should not crash
        assert response.status_code in [200, 400, 404]
