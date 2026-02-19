"""
Redis connection manager for Live View.
Provides async connection pool, pub/sub helpers, and key namespace utilities.
"""
from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Coroutine, Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis
from redis.asyncio.client import PubSub

from shared.config import Settings, get_settings
from shared.utils.logging import get_logger

logger = get_logger(__name__)

# ── Key namespaces ──────────────────────────────────────────────────────
PRESENCE_KEY = "presence:channel:{channel}"
SNAP_SCOREBOARD_KEY = "snap:match:{match_id}:scoreboard"
SNAP_EVENTS_KEY = "snap:match:{match_id}:events"
SNAP_STATS_KEY = "snap:match:{match_id}:stats"
STREAM_EVENTS_KEY = "stream:match:{match_id}:events"
HEALTH_KEY = "health:provider:{provider}"
SELECT_KEY = "select:match:{match_id}:tier:{tier}"
LEADER_KEY = "leader:{role}"
QUOTA_KEY = "quota:provider:{provider}:window"
SUBSCRIBER_COUNT_KEY = "subcnt:match:{match_id}"
FANOUT_CHANNEL = "fanout:match:{match_id}:tier:{tier}"


def _fmt(template: str, **kwargs: Any) -> str:
    return template.format(**kwargs)


class RedisManager:
    """Manages async Redis connection pool and provides typed helpers."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._pool: Optional[Redis] = None
        self._pubsub_conn: Optional[Redis] = None

    async def connect(self) -> None:
        """Initialize the connection pool."""
        self._pool = aioredis.from_url(
            self._settings.redis_url_str,
            max_connections=self._settings.redis_max_connections,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
            retry_on_timeout=True,
        )
        # Verify
        await self._pool.ping()
        logger.info("redis_connected", url=self._settings.redis_url_str)

    async def disconnect(self) -> None:
        """Graceful shutdown."""
        if self._pool:
            await self._pool.aclose()
            logger.info("redis_disconnected")

    @property
    def client(self) -> Redis:
        if self._pool is None:
            raise RuntimeError("RedisManager not connected. Call connect() first.")
        return self._pool

    # ── Snapshot helpers ────────────────────────────────────────────────
    async def set_snapshot(self, key: str, data: str, ttl_s: int = 300) -> None:
        """Store a JSON snapshot with TTL."""
        await self.client.set(key, data, ex=ttl_s)

    async def get_snapshot(self, key: str) -> Optional[str]:
        """Retrieve a JSON snapshot."""
        return await self.client.get(key)

    # ── Presence ────────────────────────────────────────────────────────
    async def add_presence(self, channel: str, connection_id: str, ttl_s: int = 60) -> int:
        """Add a connection to channel presence set. Returns updated count."""
        key = _fmt(PRESENCE_KEY, channel=channel)
        pipe = self.client.pipeline(transaction=True)
        pipe.sadd(key, connection_id)
        pipe.expire(key, ttl_s)
        pipe.scard(key)
        results = await pipe.execute()
        return int(results[2])

    async def remove_presence(self, channel: str, connection_id: str) -> int:
        """Remove a connection from channel presence. Returns updated count."""
        key = _fmt(PRESENCE_KEY, channel=channel)
        pipe = self.client.pipeline(transaction=True)
        pipe.srem(key, connection_id)
        pipe.scard(key)
        results = await pipe.execute()
        return int(results[1])

    async def get_presence_count(self, channel: str) -> int:
        """Get the number of connections in a channel."""
        key = _fmt(PRESENCE_KEY, channel=channel)
        return await self.client.scard(key)

    async def increment_presence(self, channel: str, ttl_s: int = 120) -> int:
        """Increment the subscriber count for a channel. Returns new count."""
        key = f"presence:count:{channel}"
        pipe = self.client.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, ttl_s)
        results = await pipe.execute()
        return int(results[0])

    async def decrement_presence(self, channel: str, ttl_s: int = 120) -> int:
        """Decrement the subscriber count for a channel. Returns new count."""
        key = f"presence:count:{channel}"
        pipe = self.client.pipeline(transaction=True)
        pipe.decr(key)
        pipe.expire(key, ttl_s)
        results = await pipe.execute()
        val = int(results[0])
        if val < 0:
            await self.client.set(key, 0, ex=ttl_s)
            return 0
        return val

    # ── Subscriber count for scheduler demand ──────────────────────────
    async def get_subscriber_count(self, match_id: str) -> int:
        key = _fmt(SUBSCRIBER_COUNT_KEY, match_id=match_id)
        val = await self.client.get(key)
        return int(val) if val else 0

    async def incr_subscriber_count(self, match_id: str, delta: int = 1, ttl_s: int = 600) -> int:
        key = _fmt(SUBSCRIBER_COUNT_KEY, match_id=match_id)
        pipe = self.client.pipeline(transaction=True)
        pipe.incrby(key, delta)
        pipe.expire(key, ttl_s)
        results = await pipe.execute()
        return int(results[0])

    # ── Pub/Sub publish ─────────────────────────────────────────────────
    async def publish_delta(self, match_id: str, tier: int, payload: str) -> int:
        """Publish a delta message to the fanout channel."""
        channel = _fmt(FANOUT_CHANNEL, match_id=match_id, tier=tier)
        return await self.client.publish(channel, payload)

    # ── Pub/Sub subscribe ───────────────────────────────────────────────
    async def subscribe_channel(self, pattern: str) -> PubSub:
        """Create a PubSub subscription on a pattern."""
        pubsub = self.client.pubsub()
        await pubsub.psubscribe(pattern)
        return pubsub

    # ── Provider health ─────────────────────────────────────────────────
    async def record_provider_sample(
        self, provider: str, latency_ms: float, is_error: bool, is_rate_limited: bool
    ) -> None:
        """Append a health sample to the provider's rolling window."""
        key = _fmt(HEALTH_KEY, provider=provider)
        sample = json.dumps({
            "ts": time.time(),
            "latency_ms": latency_ms,
            "error": is_error,
            "rate_limited": is_rate_limited,
        })
        pipe = self.client.pipeline(transaction=True)
        pipe.rpush(key, sample)
        pipe.ltrim(key, -500, -1)  # Keep last 500 samples
        pipe.expire(key, self._settings.provider_health_window_s * 2)
        await pipe.execute()

    async def get_provider_samples(self, provider: str) -> list[dict[str, Any]]:
        """Retrieve raw health samples for a provider."""
        key = _fmt(HEALTH_KEY, provider=provider)
        raw = await self.client.lrange(key, 0, -1)
        return [json.loads(r) for r in raw]

    # ── Provider selection ──────────────────────────────────────────────
    async def get_provider_selection(self, match_id: str, tier: int) -> Optional[str]:
        key = _fmt(SELECT_KEY, match_id=match_id, tier=tier)
        return await self.client.get(key)

    async def set_provider_selection(
        self, match_id: str, tier: int, provider: str, ttl_s: int = 300
    ) -> None:
        key = _fmt(SELECT_KEY, match_id=match_id, tier=tier)
        await self.client.set(key, provider, ex=ttl_s)

    # ── Quota tracking ──────────────────────────────────────────────────
    async def increment_quota(self, provider: str, window_s: int = 60) -> int:
        """Increment the request counter for a provider's current window."""
        key = _fmt(QUOTA_KEY, provider=provider)
        pipe = self.client.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, window_s)
        results = await pipe.execute()
        return int(results[0])

    async def get_quota_usage(self, provider: str) -> int:
        key = _fmt(QUOTA_KEY, provider=provider)
        val = await self.client.get(key)
        return int(val) if val else 0

    # ── Leader election ─────────────────────────────────────────────────

    # Lua script: atomically renew TTL only if we hold the lock
    _RENEW_LEADER_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    redis.call("expire", KEYS[1], ARGV[2])
    return 1
end
return 0
"""

    # Lua script: atomically delete only if we hold the lock
    _RELEASE_LEADER_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    redis.call("del", KEYS[1])
    return 1
end
return 0
"""

    async def try_acquire_leader(self, role: str, instance_id: str, ttl_s: int = 30) -> bool:
        """Attempt to acquire leadership using SET NX."""
        key = _fmt(LEADER_KEY, role=role)
        return await self.client.set(key, instance_id, nx=True, ex=ttl_s)

    async def renew_leader(self, role: str, instance_id: str, ttl_s: int = 30) -> bool:
        """Atomically renew leadership if still the current leader."""
        key = _fmt(LEADER_KEY, role=role)
        result = await self.client.eval(
            self._RENEW_LEADER_SCRIPT, 1, key, instance_id, str(ttl_s)
        )
        return bool(result)

    async def release_leader(self, role: str, instance_id: str) -> bool:
        """Atomically release leadership only if we hold it."""
        key = _fmt(LEADER_KEY, role=role)
        result = await self.client.eval(
            self._RELEASE_LEADER_SCRIPT, 1, key, instance_id
        )
        return bool(result)

    # ── Stream helpers for event replay ─────────────────────────────────
    async def append_event_stream(
        self, match_id: str, event_data: str, max_len: int = 500
    ) -> str:
        """Append an event to the match event stream. Returns stream entry ID."""
        key = _fmt(STREAM_EVENTS_KEY, match_id=match_id)
        entry_id = await self.client.xadd(key, {"data": event_data}, maxlen=max_len)
        return entry_id

    async def read_event_stream(
        self, match_id: str, last_id: str = "0", count: int = 100
    ) -> list[tuple[str, dict[str, str]]]:
        """Read events from stream since last_id."""
        key = _fmt(STREAM_EVENTS_KEY, match_id=match_id)
        return await self.client.xrange(key, min=last_id, count=count)
