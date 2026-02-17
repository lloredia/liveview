"""
WebSocket connection manager for Live View.

Manages client WebSocket connections with:
- Channel-based subscriptions (subscribe to match scoreboards, events, etc.)
- Replay-on-connect: sends the current snapshot when a client subscribes
- Heartbeat/ping-pong for connection liveness
- Redis pub/sub bridge for multi-instance fan-out
- Per-connection subscription limits
- Presence tracking for demand-based polling
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from shared.config import Settings, get_settings
from shared.models.enums import Tier, WSClientOp, WSServerMsgType
from shared.utils.logging import get_logger
from shared.utils.metrics import WS_CONNECTIONS, WS_MESSAGES
from shared.utils.redis_manager import RedisManager

logger = get_logger(__name__)

# Maximum channels a single connection can subscribe to
MAX_SUBSCRIPTIONS_PER_CONN = 25
# Heartbeat interval (server sends ping)
HEARTBEAT_INTERVAL_S = 30.0
# Client must respond within this window
HEARTBEAT_TIMEOUT_S = 10.0


@dataclass
class WSConnection:
    """Represents a single WebSocket client connection."""

    ws: WebSocket
    connection_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    subscriptions: set[str] = field(default_factory=set)
    created_at: float = field(default_factory=time.monotonic)
    last_pong_at: float = field(default_factory=time.monotonic)
    remote_addr: str = ""

    @property
    def alive_seconds(self) -> float:
        return time.monotonic() - self.created_at


class WebSocketManager:
    """
    Manages all WebSocket connections for this API instance.

    Architecture:
    - Each connection can subscribe to multiple channels.
    - Channels follow the pattern: match:{match_id}:tier:{tier}
    - When a client subscribes, they get an immediate snapshot (replay).
    - Ongoing updates are bridged from Redis pub/sub to connected clients.
    - Presence counts are tracked in Redis for demand-based scheduling.
    """

    def __init__(self, redis: RedisManager, settings: Settings | None = None) -> None:
        self._redis = redis
        self._settings = settings or get_settings()
        self._connections: dict[str, WSConnection] = {}
        # channel -> set of connection_ids
        self._channel_subscribers: dict[str, set[str]] = {}
        self._pubsub_task: Optional[asyncio.Task[None]] = None
        self._heartbeat_task: Optional[asyncio.Task[None]] = None
        self._shutdown = asyncio.Event()
        # Track which Redis channels we're actually subscribed to
        self._subscribed_channels: set[str] = set()

    @property
    def connection_count(self) -> int:
        """Current number of active connections."""
        return len(self._connections)

    async def start(self) -> None:
        """Start background tasks (pubsub bridge, heartbeat)."""
        self._pubsub_task = asyncio.create_task(self._run_pubsub_bridge())
        self._heartbeat_task = asyncio.create_task(self._run_heartbeat())
        logger.info("ws_manager_started")

    async def stop(self) -> None:
        """Stop background tasks and close all connections."""
        self._shutdown.set()
        if self._pubsub_task:
            self._pubsub_task.cancel()
        if self._heartbeat_task:
            self._heartbeat_task.cancel()

        # Close all connections
        for conn in list(self._connections.values()):
            await self._close_connection(conn, code=1001, reason="server_shutdown")

        logger.info("ws_manager_stopped", total_connections_served=len(self._connections))

    async def handle_connection(self, ws: WebSocket) -> None:
        """
        Handle a new WebSocket connection lifecycle.

        Accepts the connection, processes messages, and cleans up on disconnect.
        """
        await ws.accept()

        conn = WSConnection(
            ws=ws,
            remote_addr=f"{ws.client.host}:{ws.client.port}" if ws.client else "unknown",
        )
        self._connections[conn.connection_id] = conn
        WS_CONNECTIONS.inc()

        logger.info(
            "ws_connected",
            connection_id=conn.connection_id,
            remote_addr=conn.remote_addr,
        )

        # Send welcome message with connection ID
        await self._send(conn, {
            "type": WSServerMsgType.STATE.value,
            "connection_id": conn.connection_id,
            "max_subscriptions": MAX_SUBSCRIPTIONS_PER_CONN,
            "heartbeat_interval": HEARTBEAT_INTERVAL_S,
        })

        try:
            while not self._shutdown.is_set():
                try:
                    raw = await asyncio.wait_for(ws.receive_text(), timeout=60.0)
                except asyncio.TimeoutError:
                    continue

                WS_MESSAGES.labels(direction="in").inc()
                await self._handle_message(conn, raw)

        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.warning(
                "ws_connection_error",
                connection_id=conn.connection_id,
                error=str(exc),
            )
        finally:
            await self._cleanup_connection(conn)

    async def _handle_message(self, conn: WSConnection, raw: str) -> None:
        """Parse and dispatch a client message."""
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await self._send_error(conn, "invalid_json", "Message must be valid JSON")
            return

        op = msg.get("op")
        if not op:
            await self._send_error(conn, "missing_op", "Message must include 'op' field")
            return

        try:
            operation = WSClientOp(op)
        except ValueError:
            await self._send_error(
                conn, "unknown_op", f"Unknown operation: {op}"
            )
            return

        if operation == WSClientOp.SUBSCRIBE:
            await self._handle_subscribe(conn, msg)
        elif operation == WSClientOp.UNSUBSCRIBE:
            await self._handle_unsubscribe(conn, msg)
        elif operation == WSClientOp.PING:
            await self._handle_ping(conn)
        else:
            await self._send_error(conn, "unhandled_op", f"Unhandled operation: {op}")

    async def _handle_subscribe(self, conn: WSConnection, msg: dict[str, Any]) -> None:
        """
        Handle a subscribe request.

        Expected message:
        {
            "op": "subscribe",
            "match_id": "uuid-string",
            "tiers": [0, 1]  // optional, defaults to [0] (scoreboard only)
        }
        """
        match_id = msg.get("match_id")
        if not match_id:
            await self._send_error(conn, "missing_match_id", "subscribe requires match_id")
            return

        try:
            uuid.UUID(match_id)
        except ValueError:
            await self._send_error(conn, "invalid_match_id", "match_id must be a valid UUID")
            return

        tiers = msg.get("tiers", [0])
        if not isinstance(tiers, list):
            tiers = [tiers]

        channels_to_add: list[str] = []
        for tier_val in tiers:
            try:
                tier = Tier(tier_val)
            except ValueError:
                continue
            channel = f"fanout:match:{match_id}:tier:{tier.value}"
            channels_to_add.append(channel)

        # Check subscription limit
        if len(conn.subscriptions) + len(channels_to_add) > MAX_SUBSCRIPTIONS_PER_CONN:
            await self._send_error(
                conn,
                "subscription_limit",
                f"Maximum {MAX_SUBSCRIPTIONS_PER_CONN} subscriptions per connection",
            )
            return

        for channel in channels_to_add:
            conn.subscriptions.add(channel)
            if channel not in self._channel_subscribers:
                self._channel_subscribers[channel] = set()
            self._channel_subscribers[channel].add(conn.connection_id)

            # Update presence in Redis for demand-based polling
            await self._redis.increment_presence(channel)

        logger.debug(
            "ws_subscribed",
            connection_id=conn.connection_id,
            match_id=match_id,
            channels=channels_to_add,
        )

        # Send subscription confirmation
        await self._send(conn, {
            "type": WSServerMsgType.STATE.value,
            "subscribed": list(conn.subscriptions),
        })

        # Replay-on-connect: send current snapshot for each subscribed tier
        for tier_val in tiers:
            await self._send_replay(conn, match_id, tier_val)

    async def _handle_unsubscribe(self, conn: WSConnection, msg: dict[str, Any]) -> None:
        """Handle an unsubscribe request."""
        match_id = msg.get("match_id")
        if not match_id:
            await self._send_error(conn, "missing_match_id", "unsubscribe requires match_id")
            return

        tiers = msg.get("tiers", [0, 1, 2])  # Unsubscribe from all tiers by default
        if not isinstance(tiers, list):
            tiers = [tiers]

        for tier_val in tiers:
            channel = f"fanout:match:{match_id}:tier:{tier_val}"
            conn.subscriptions.discard(channel)
            if channel in self._channel_subscribers:
                self._channel_subscribers[channel].discard(conn.connection_id)
                if not self._channel_subscribers[channel]:
                    del self._channel_subscribers[channel]
            await self._redis.decrement_presence(channel)

        await self._send(conn, {
            "type": WSServerMsgType.STATE.value,
            "subscribed": list(conn.subscriptions),
        })

    async def _handle_ping(self, conn: WSConnection) -> None:
        """Handle client ping, respond with pong."""
        conn.last_pong_at = time.monotonic()
        await self._send(conn, {
            "type": WSServerMsgType.PONG.value,
            "timestamp": time.time(),
        })

    async def _send_replay(
        self, conn: WSConnection, match_id: str, tier: int
    ) -> None:
        """
        Send the current snapshot for a match+tier to a newly subscribed client.

        This ensures clients don't miss any state that occurred before they connected.
        """
        tier_key_map = {
            0: "scoreboard",
            1: "events",
            2: "stats",
        }
        tier_name = tier_key_map.get(tier, "scoreboard")
        snap_key = f"snap:match:{match_id}:{tier_name}"

        cached = await self._redis.client.get(snap_key)
        if cached:
            try:
                data = json.loads(cached)
                await self._send(conn, {
                    "type": WSServerMsgType.SNAPSHOT.value,
                    "match_id": match_id,
                    "tier": tier,
                    "data": data,
                    "replay": True,
                })
                logger.debug(
                    "ws_replay_sent",
                    connection_id=conn.connection_id,
                    match_id=match_id,
                    tier=tier,
                )
            except json.JSONDecodeError:
                pass

        # For events tier, also send the event stream
        if tier == 1:
            events_key = f"stream:match:{match_id}:events"
            try:
                events_raw = await self._redis.client.lrange(events_key, 0, 99)
                if events_raw:
                    events = []
                    for raw in events_raw:
                        try:
                            evt = json.loads(raw)
                            events.append(evt)
                        except json.JSONDecodeError:
                            continue
                    if events:
                        await self._send(conn, {
                            "type": WSServerMsgType.SNAPSHOT.value,
                            "match_id": match_id,
                            "tier": 1,
                            "data": events,
                            "replay": True,
                            "kind": "events_batch",
                        })
            except Exception:
                pass

    async def _run_pubsub_bridge(self) -> None:
        """
        Bridge Redis pub/sub messages to WebSocket clients.

        Subscribes to all channels that have active WebSocket subscribers.
        Dynamically adjusts subscriptions as clients connect/disconnect.
        """
        pubsub = self._redis.client.pubsub()

        # Subscribe to the pattern for all match fanout channels
        await pubsub.psubscribe("fanout:match:*:tier:*")
        logger.info("ws_pubsub_bridge_started")

        try:
            while not self._shutdown.is_set():
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=0.1
                )
                if message and message["type"] == "pmessage":
                    channel = (
                        message["channel"].decode()
                        if isinstance(message["channel"], bytes)
                        else message["channel"]
                    )
                    data = (
                        message["data"].decode()
                        if isinstance(message["data"], bytes)
                        else message["data"]
                    )
                    await self._fan_out_to_subscribers(channel, data)
                else:
                    await asyncio.sleep(0.005)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.punsubscribe("fanout:match:*:tier:*")
            await pubsub.close()

    async def _fan_out_to_subscribers(self, channel: str, data: str) -> None:
        """Send a message from Redis to all WebSocket clients subscribed to that channel."""
        subscriber_ids = self._channel_subscribers.get(channel, set())
        if not subscriber_ids:
            return

        # Parse channel to extract match_id and tier
        parts = channel.split(":")
        match_id = parts[2] if len(parts) > 2 else ""
        tier = int(parts[4]) if len(parts) > 4 else 0

        try:
            payload = json.loads(data)
        except json.JSONDecodeError:
            return

        message = {
            "type": WSServerMsgType.DELTA.value,
            "match_id": match_id,
            "tier": tier,
            "data": payload,
            "timestamp": time.time(),
        }

        # Fan-out to all subscribers (concurrent sends)
        tasks = []
        for conn_id in list(subscriber_ids):
            conn = self._connections.get(conn_id)
            if conn:
                tasks.append(self._send(conn, message))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
            WS_MESSAGES.labels(direction="out").inc(len(tasks))

    async def _run_heartbeat(self) -> None:
        """
        Periodically send heartbeat pings to all connections.
        Disconnect clients that haven't responded.
        """
        while not self._shutdown.is_set():
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL_S)
                if self._shutdown.is_set():
                    break

                now = time.monotonic()
                stale_connections: list[WSConnection] = []

                for conn in list(self._connections.values()):
                    # Check if client missed the heartbeat window
                    if now - conn.last_pong_at > HEARTBEAT_INTERVAL_S + HEARTBEAT_TIMEOUT_S:
                        stale_connections.append(conn)
                        continue

                    # Send ping
                    try:
                        await self._send(conn, {
                            "type": "ping",
                            "timestamp": time.time(),
                        })
                    except Exception:
                        stale_connections.append(conn)

                for conn in stale_connections:
                    logger.info(
                        "ws_heartbeat_timeout",
                        connection_id=conn.connection_id,
                        alive_seconds=round(conn.alive_seconds, 1),
                    )
                    await self._close_connection(conn, code=1000, reason="heartbeat_timeout")

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("ws_heartbeat_error", error=str(exc))

    async def _send(self, conn: WSConnection, message: dict[str, Any]) -> None:
        """Send a JSON message to a WebSocket connection."""
        try:
            if conn.ws.client_state == WebSocketState.CONNECTED:
                await conn.ws.send_text(json.dumps(message, default=str))
        except Exception as exc:
            logger.debug(
                "ws_send_error",
                connection_id=conn.connection_id,
                error=str(exc),
            )

    async def _send_error(
        self, conn: WSConnection, code: str, message: str
    ) -> None:
        """Send an error message to a WebSocket connection."""
        await self._send(conn, {
            "type": WSServerMsgType.ERROR.value,
            "error": {"code": code, "message": message},
        })

    async def _close_connection(
        self, conn: WSConnection, code: int = 1000, reason: str = ""
    ) -> None:
        """Close a WebSocket connection and clean up."""
        try:
            if conn.ws.client_state == WebSocketState.CONNECTED:
                await conn.ws.close(code=code, reason=reason)
        except Exception:
            pass
        await self._cleanup_connection(conn)

    async def _cleanup_connection(self, conn: WSConnection) -> None:
        """Remove a connection from all tracking structures."""
        # Remove from connections
        self._connections.pop(conn.connection_id, None)
        WS_CONNECTIONS.dec()

        # Remove from channel subscribers and update presence
        for channel in conn.subscriptions:
            if channel in self._channel_subscribers:
                self._channel_subscribers[channel].discard(conn.connection_id)
                if not self._channel_subscribers[channel]:
                    del self._channel_subscribers[channel]
            await self._redis.decrement_presence(channel)

        logger.info(
            "ws_disconnected",
            connection_id=conn.connection_id,
            alive_seconds=round(conn.alive_seconds, 1),
            subscriptions=len(conn.subscriptions),
        )
