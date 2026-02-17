"use client";

const STORAGE_KEY_LEAGUES = "lv_fav_leagues";

function getStored(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStored(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

export function getFavoriteLeagues(): string[] {
  return getStored(STORAGE_KEY_LEAGUES);
}

export function toggleFavoriteLeague(id: string): boolean {
  const current = getStored(STORAGE_KEY_LEAGUES);
  const idx = current.indexOf(id);
  if (idx >= 0) {
    current.splice(idx, 1);
    setStored(STORAGE_KEY_LEAGUES, current);
    syncFavoriteToCloud(id, "league", false);
    return false;
  } else {
    current.push(id);
    setStored(STORAGE_KEY_LEAGUES, current);
    syncFavoriteToCloud(id, "league", true);
    return true;
  }
}

export function isFavoriteLeague(id: string): boolean {
  return getStored(STORAGE_KEY_LEAGUES).includes(id);
}

/**
 * Sync a favorite change to the backend if the user is logged in.
 * Fire-and-forget — doesn't block the UI.
 */
function syncFavoriteToCloud(targetId: string, type: string, add: boolean): void {
  try {
    const token = localStorage.getItem("lv_token");
    if (!token) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    if (add) {
      fetch(`${apiBase}/v1/user/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ favorite_type: type, target_id: targetId }),
      }).catch(() => {});
    } else {
      fetch(`${apiBase}/v1/user/favorites/${type}/${targetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  } catch {}
}

/**
 * Load favorites from the cloud and merge with local.
 * Call this after login.
 */
export async function loadCloudFavorites(): Promise<void> {
  try {
    const token = localStorage.getItem("lv_token");
    if (!token) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${apiBase}/v1/user/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const data = await res.json();

    const cloudLeagues = (data.favorites || [])
      .filter((f: any) => f.type === "league")
      .map((f: any) => f.target_id);

    // Merge: cloud + local (deduplicate)
    const local = getStored(STORAGE_KEY_LEAGUES);
    const merged = [...new Set([...cloudLeagues, ...local])];
    setStored(STORAGE_KEY_LEAGUES, merged);

    // Push any local-only favorites to cloud
    for (const id of local) {
      if (!cloudLeagues.includes(id)) {
        syncFavoriteToCloud(id, "league", true);
      }
    }
  } catch {}
}