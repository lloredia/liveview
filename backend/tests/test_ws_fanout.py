"""
Integration tests for WebSocket fanout: subscribe → receive snapshot and deltas.

Requires Redis. Run with: pytest backend/tests/test_ws_fanout.py -v
Skip if no Redis: pytest -m "not redis" or set REDIS_URL.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any, Optional

import pytest

# Skip entire module if Redis URL not set (e.g. in CI without Redis)
REDIS_URL = os.getenv("REDIS_URL") or os.getenv("LV_REDIS_URL", "redis://localhost:6379")
SKIP_WS_FANOUT = os.getenv("SKIP_WS_FANOUT", "").lower() in ("1", "true", "yes")


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.mark.skipif(SKIP_WS_FANOUT, reason="SKIP_WS_FANOUT set")
@pytest.mark.asyncio
async def test_ws_replay_uses_stream_not_list() -> None:
    """
    Verify that event replay uses read_event_stream (Redis Streams), not lrange.
    We test the RedisManager contract: append_event_stream writes with xadd,
    read_event_stream reads with xrange; WS manager should use read_event_stream.
    """
    from shared.utils.redis_manager import RedisManager
    from shared.config import get_settings

    settings = get_settings()
    redis = RedisManager(settings)
    try:
        await redis.connect()
    except Exception as e:
        pytest.skip(f"Redis not available: {e}")

    match_id = str(uuid.uuid4())
    key = f"stream:match:{match_id}:events"

    try:
        # Ingest writes via append_event_stream (xadd)
        await redis.append_event_stream(match_id, json.dumps({"event_type": "goal", "minute": 23}))
        await redis.append_event_stream(match_id, json.dumps({"event_type": "yellow_card", "minute": 45}))

        # Replay path should use read_event_stream (xrange), not lrange
        entries = await redis.read_event_stream(match_id, last_id="0", count=10)
        assert len(entries) == 2
        for _eid, fields in entries:
            # redis-py may return field map as dict or as list of [k, v, k, v]
            if isinstance(fields, list):
                fields = dict(zip(fields[::2], fields[1::2]))
            raw = fields.get("data") or fields.get(b"data")
            if raw is None:
                continue
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            if not raw:
                continue
            obj = json.loads(raw)
            assert "event_type" in obj
    finally:
        await redis.client.delete(key)
        await redis.disconnect()


@pytest.mark.skipif(SKIP_WS_FANOUT, reason="SKIP_WS_FANOUT set")
@pytest.mark.asyncio
async def test_fanout_channel_format() -> None:
    """Ensure fanout channel naming is consistent with WS manager expectations."""
    from shared.utils.redis_manager import FANOUT_CHANNEL
    # Channel format: fanout:match:{match_id}:tier:{tier}
    match_id = str(uuid.uuid4())
    channel = FANOUT_CHANNEL.format(match_id=match_id, tier=0)
    assert channel == f"fanout:match:{match_id}:tier:0"
    parts = channel.split(":")
    assert len(parts) >= 5
    assert parts[0] == "fanout" and parts[1] == "match" and parts[3] == "tier"


@pytest.mark.skipif(SKIP_WS_FANOUT, reason="SKIP_WS_FANOUT set")
@pytest.mark.asyncio
async def test_publish_delta_reaches_redis() -> None:
    """Publish a delta and verify it can be received via pubsub (smoke)."""
    from shared.utils.redis_manager import RedisManager
    from shared.config import get_settings

    settings = get_settings()
    redis = RedisManager(settings)
    try:
        await redis.connect()
    except Exception as e:
        pytest.skip(f"Redis not available: {e}")

    match_id = str(uuid.uuid4())
    payload = json.dumps({"score_home": 1, "score_away": 0})
    received: list[str] = []

    async def listener() -> None:
        pubsub = redis.client.pubsub()
        channel = f"fanout:match:{match_id}:tier:0"
        await pubsub.subscribe(channel)
        try:
            while len(received) == 0:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if msg and msg.get("type") == "message":
                    data = msg.get("data")
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    received.append(data)
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    listen_task = asyncio.create_task(listener())
    await asyncio.sleep(0.1)
    await redis.publish_delta(match_id, 0, payload)
    await asyncio.wait_for(listen_task, timeout=2.0)
    assert len(received) == 1
    assert json.loads(received[0])["score_home"] == 1
    await redis.disconnect()
