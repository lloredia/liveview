const KEY = "lv_pinned_matches";

/** Maximum number of games you can track at once. */
export const MAX_PINNED = 10;

export function getPinnedMatches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const val = localStorage.getItem(KEY);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

export function setPinnedMatches(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_PINNED)));
  } catch {}
}

export function togglePinned(matchId: string): string[] {
  const current = getPinnedMatches();
  const idx = current.indexOf(matchId);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else if (current.length < MAX_PINNED) {
    current.push(matchId);
  }
  setPinnedMatches(current);
  return [...current];
}

export function isPinned(matchId: string): boolean {
  return getPinnedMatches().includes(matchId);
}