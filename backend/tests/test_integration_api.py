"""
Integration tests for API endpoints.
Tests the full stack: client → API → DB → Redis

Run with: pytest backend/tests/test_integration_api.py -v
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from api.app import create_app
from shared.config import Settings, Environment, ServiceRole
from shared.models.orm import LeagueORM, SportORM, MatchORM, TeamORM, MatchStateORM
from shared.utils.database import DatabaseManager
from shared.utils.redis_manager import RedisManager


@pytest.fixture
async def settings():
    """Test settings with test database."""
    return Settings(
        environment=Environment.DEV,
        service_role=ServiceRole.API,
        debug=True,
        database_url="postgresql+asyncpg://liveview:liveview@localhost/liveview_test",
        redis_url="redis://localhost:6379/1",
        log_level="DEBUG",
    )


@pytest.fixture
async def db(settings):
    """Test database connection."""
    db_manager = DatabaseManager(settings)
    await db_manager.connect()
    # Create test tables
    from shared.models.orm import Base
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield db_manager
    # Cleanup
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await db_manager.disconnect()


@pytest.fixture
async def redis(settings):
    """Test Redis connection."""
    redis_manager = RedisManager(settings)
    await redis_manager.connect()
    # Clear all data
    await redis_manager.client.flushdb()
    yield redis_manager
    await redis_manager.disconnect()


@pytest.fixture
async def client(settings, db, redis):
    """Test API client with full stack."""
    app = create_app(db, redis)
    async with AsyncClient(app=app, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
async def test_data(db):
    """Populate test database with sample data."""
    async with db.write_session() as session:
        # Create sport
        sport = SportORM(id=uuid.uuid4(), name="soccer", sport_type="soccer")
        session.add(sport)
        await session.flush()

        # Create league
        league = LeagueORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Premier League",
            short_name="EPL",
            country="England",
            active=True,
        )
        session.add(league)
        await session.flush()

        # Create teams
        home_team = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Arsenal",
            short_name="ARS",
            abbreviation="ARS",
            country="England",
        )
        away_team = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Chelsea",
            short_name="CHE",
            abbreviation="CHE",
            country="England",
        )
        session.add(home_team)
        session.add(away_team)
        await session.flush()

        # Create match
        match = MatchORM(
            id=uuid.uuid4(),
            league_id=league.id,
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            phase="SCHEDULED",
            start_time=datetime.now(timezone.utc) + timedelta(hours=2),
            venue="Emirates Stadium",
        )
        session.add(match)
        await session.flush()

        # Create match state
        match_state = MatchStateORM(
            match_id=match.id,
            score_home=0,
            score_away=0,
            clock=None,
            period=None,
            version=1,
        )
        session.add(match_state)
        await session.commit()

        return {
            "sport": sport,
            "league": league,
            "home_team": home_team,
            "away_team": away_team,
            "match": match,
        }


@pytest.mark.asyncio
async def test_get_leagues(client, test_data):
    """Test GET /v1/leagues endpoint."""
    response = await client.get("/v1/leagues")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["name"] == "Premier League"


@pytest.mark.asyncio
async def test_get_scoreboard(client, test_data):
    """Test GET /v1/leagues/{id}/scoreboard endpoint."""
    league_id = test_data["league"].id
    response = await client.get(f"/v1/leagues/{league_id}/scoreboard")
    assert response.status_code == 200
    data = response.json()
    assert "matches" in data


@pytest.mark.asyncio
async def test_get_match_center(client, test_data):
    """Test GET /v1/matches/{id} endpoint."""
    match_id = test_data["match"].id
    response = await client.get(f"/v1/matches/{match_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["home_team"]["name"] == "Arsenal"
    assert data["away_team"]["name"] == "Chelsea"


@pytest.mark.asyncio
async def test_get_match_timeline(client, test_data):
    """Test GET /v1/matches/{id}/timeline endpoint."""
    match_id = test_data["match"].id
    response = await client.get(f"/v1/matches/{match_id}/timeline")
    assert response.status_code == 200
    data = response.json()
    assert "events" in data


@pytest.mark.asyncio
async def test_etag_caching(client, test_data):
    """Test ETag-based caching on GET /v1/matches/{id}."""
    match_id = test_data["match"].id
    
    # First request
    response1 = await client.get(f"/v1/matches/{match_id}")
    assert response1.status_code == 200
    etag = response1.headers.get("ETag")
    assert etag is not None
    
    # Second request with ETag
    response2 = await client.get(f"/v1/matches/{match_id}", headers={"If-None-Match": etag})
    assert response2.status_code == 304  # Not modified


@pytest.mark.asyncio
async def test_match_not_found(client):
    """Test 404 on non-existent match."""
    fake_id = uuid.uuid4()
    response = await client.get(f"/v1/matches/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_rate_limiting(client, test_data):
    """Test rate limiting enforcement."""
    # Make 121 requests (exceeds default 120 limit per minute)
    responses = []
    for i in range(121):
        response = await client.get("/v1/leagues")
        responses.append(response.status_code)
    
    # Should have at least one 429 (Too Many Requests)
    assert 429 in responses


@pytest.mark.asyncio
async def test_redis_snapshot_sync(client, test_data, redis):
    """Test that API snapshots are properly synced to Redis."""
    match_id = test_data["match"].id
    
    # Get match data
    response = await client.get(f"/v1/matches/{match_id}")
    assert response.status_code == 200
    
    # Check if snapshot exists in Redis
    snap_key = f"snap:match:{match_id}:scoreboard"
    cached = await redis.client.get(snap_key)
    assert cached is not None
    
    # Verify cached data matches response
    cached_data = json.loads(cached)
    assert cached_data["home_team"]["id"] == str(test_data["home_team"].id)


@pytest.mark.asyncio
async def test_invalid_date_parameter(client):
    """Test validation of date parameter in today endpoint."""
    # Invalid date format
    response = await client.get("/v1/today?date=2024/01/01")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_league_ids_filtering(client, test_data):
    """Test filtering matches by league_ids parameter."""
    league_id = str(test_data["league"].id)
    response = await client.get(f"/v1/today?league_ids={league_id}")
    assert response.status_code == 200
    data = response.json()
    # Should contain matches from this league
    assert "leagues" in data


@pytest.mark.asyncio
async def test_cors_headers(client):
    """Test CORS headers are properly set."""
    response = await client.get("/v1/leagues")
    # CORS headers should be present
    assert "access-control-allow-origin" in response.headers or "Access-Control-Allow-Origin" in response.headers.keys()


@pytest.mark.asyncio
async def test_request_id_injection(client):
    """Test that X-Request-ID is injected and returned."""
    response = await client.get("/v1/leagues")
    assert "x-request-id" in response.headers or "X-Request-ID" in response.headers
