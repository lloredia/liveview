"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getWsUrl } from "@/lib/api";
import type { WSMessage } from "@/lib/types";

async function fetchBackendToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/backend-token");
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

interface UseWebSocketOptions {
  matchId: string | null | undefined;
  tiers?: number[];
  bufferSize?: number;
}

interface UseWebSocketReturn {
  messages: WSMessage[];
  connected: boolean;
  error: string | null;
}

const DEFAULT_TIERS = [0, 1];

export function useWebSocket({
  matchId,
  tiers = DEFAULT_TIERS,
  bufferSize = 50,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;

  // Stable reference: only changes when tier values actually change
  const tiersKey = useMemo(() => tiers.slice().sort().join(","), [tiers]);

  useEffect(() => {
    if (!matchId) {
      setConnected(false);
      setError(null);
      setMessages([]);
      return;
    }

    setMessages([]);
    reconnectAttempts.current = 0;

    const currentTiers = tiersKey.split(",").map(Number);
    let destroyed = false;

    const connect = async () => {
      if (matchIdRef.current !== matchId || reconnectAttempts.current > 10 || destroyed) return;

      const token = await fetchBackendToken();

      if (destroyed || matchIdRef.current !== matchId) return;

      try {
        const baseUrl = getWsUrl();
        const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setError(null);
          reconnectAttempts.current = 0;

          ws.send(
            JSON.stringify({
              op: "subscribe",
              match_id: matchId,
              tiers: currentTiers,
            }),
          );
        };

        ws.onmessage = (evt) => {
          try {
            const msg: WSMessage = JSON.parse(evt.data);
            if (msg.type === "pong") return;

            if (msg.type === "delta" || msg.type === "snapshot" || msg.type === "state") {
              setMessages((prev) => [...prev.slice(-(bufferSize - 1)), msg]);
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = () => {
          setError("Connection error");
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;

          if (matchIdRef.current === matchId && reconnectAttempts.current <= 10 && !destroyed) {
            const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
            reconnectAttempts.current += 1;
            reconnectTimer.current = setTimeout(() => { connect(); }, delay);
          }
        };
      } catch {
        setError("Failed to create WebSocket");
      }
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [matchId, tiersKey, bufferSize]);

  return { messages, connected, error };
}