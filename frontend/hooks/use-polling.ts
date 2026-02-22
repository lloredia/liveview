"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  /** When the tab is hidden, use this interval (e.g. longer) instead. Omit to keep same interval. */
  intervalWhenHidden?: number;
  enabled?: boolean;
  key?: string | null;
}

interface UsePollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Last thrown error (e.g. for checking ApiError.status === 404) */
  lastError: Error | null;
  refresh: () => Promise<void>;
}

export function usePolling<T>({
  fetcher,
  interval = 20000,
  intervalWhenHidden,
  enabled = true,
  key = null,
}: UsePollingOptions<T>): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [visible, setVisible] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastError(null);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Fetch failed");
      setError(err.message);
      setLastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const effectiveInterval =
    intervalWhenHidden != null && !visible ? intervalWhenHidden : interval;

  // Re-fetch when key or enabled changes. Stale-while-revalidate: keep showing old data until new data arrives.
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh();
  }, [enabled, key, refresh]);

  // Polling: background refetch does not set loading, so stale data stays visible (stale-while-revalidate).
  useEffect(() => {
    if (!enabled || effectiveInterval <= 0) return;
    const timer = setInterval(refresh, effectiveInterval);
    return () => clearInterval(timer);
  }, [enabled, effectiveInterval, key, refresh]);

  return { data, loading, error, lastError, refresh };
}