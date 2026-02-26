/**
 * In-memory + localStorage cache for Today API response.
 * Used for offline resilience and "Showing cached matches" when the network fails.
 */

import type { TodayResponse } from "@/lib/types";

const KEY_PREFIX = "lv_today_";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedToday {
  data: TodayResponse;
  savedAt: string; // ISO string
}

function cacheKey(dateStr: string | undefined): string {
  return `${KEY_PREFIX}${dateStr ?? "today"}`;
}

export function setTodayCache(dateStr: string | undefined, data: TodayResponse): void {
  if (typeof window === "undefined") return;
  const key = cacheKey(dateStr);
  const entry: CachedToday = { data, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // quota or private mode
  }
}

export function getTodayCache(dateStr: string | undefined): CachedToday | null {
  if (typeof window === "undefined") return null;
  const key = cacheKey(dateStr);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedToday;
    if (!entry?.data?.leagues || !entry.savedAt) return null;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    if (age > MAX_AGE_MS) return null;
    return entry;
  } catch {
    return null;
  }
}
