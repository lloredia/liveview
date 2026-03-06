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
  /** Timestamp (ms) of last successful fetch — for "Updated Xs ago" */
  lastSuccessAt: number | null;
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
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      // When the API returns 304 Not Modified, the fetcher may return null or cached data;
      // do not reset state to empty/loading — leave current data untouched.
      if (result != null) {
        setData(result);
        setError(null);
        setLastError(null);
        setLastSuccessAt(Date.now());
      }
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[usePolling]", { key, hasData: result != null });
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Fetch failed");
      setError(err.message);
      setLastError(err);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    setVisible(document.visibilityState === "visible");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setVisible(true);
        // Tab became visible — fire an immediate poll, then let the interval continue
        if (enabled) refresh();
      } else {
        setVisible(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, refresh]);

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

  return { data, loading, error, lastError, lastSuccessAt, refresh };
}