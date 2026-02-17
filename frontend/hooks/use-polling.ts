"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  key?: string | null;
}

interface UsePollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePolling<T>({
  fetcher,
  interval = 20000,
  enabled = true,
  key = null,
}: UsePollingOptions<T>): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when key or enabled changes
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setData(null);
    refresh();
  }, [enabled, key, refresh]);

  // Polling interval
  useEffect(() => {
    if (!enabled || interval <= 0) return;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [enabled, interval, key, refresh]);

  return { data, loading, error, refresh };
}