"use client";

import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "@/lib/api";
import type { WSMessage } from "@/lib/types";

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

  useEffect(() => {
    if (!matchId) {
      setConnected(false);
      setError(null);
      setMessages([]);
      return;
    }

    setMessages([]);
    reconnectAttempts.current = 0;

    const connect = () => {
      // Guard: don't reconnect if matchId changed or too many attempts
      if (matchIdRef.current !== matchId || reconnectAttempts.current > 10) return;

      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setError(null);
          reconnectAttempts.current = 0;

          ws.send(
            JSON.stringify({
              op: "subscribe",
              match_id: matchId,
              tiers,
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
          // Don't setState here — onclose always fires after onerror
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;

          if (matchIdRef.current === matchId && reconnectAttempts.current <= 10) {
            const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
            reconnectAttempts.current += 1;
            reconnectTimer.current = setTimeout(connect, delay);
          }
        };
      } catch {
        setError("Failed to create WebSocket");
      }
    };

    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return { messages, connected, error };
}