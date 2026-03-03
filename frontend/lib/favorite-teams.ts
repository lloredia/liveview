/**
 * Favorite teams (star) — localStorage only, no login.
 * Used for filter "Favorites" and to highlight games involving favorite teams.
 */

const STORAGE_KEY = "lv_fav_teams";

function getStored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStored(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export function getFavoriteTeams(): string[] {
  return getStored();
}

export function isFavoriteTeam(teamId: string): boolean {
  return getStored().includes(teamId);
}

export function toggleFavoriteTeam(teamId: string): boolean {
  const current = getStored();
  const idx = current.indexOf(teamId);
  if (idx >= 0) {
    current.splice(idx, 1);
    setStored(current);
    return false;
  }
  current.push(teamId);
  setStored(current);
  return true;
}
