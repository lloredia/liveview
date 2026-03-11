/**
 * Notification API client — talks to the backend notification endpoints.
 */

import { getApiBase, API_REQUEST_TIMEOUT_MS } from "./api";
import { getDeviceId } from "./device";

export interface InboxItem {
  id: string;
  game_id: string;
  event_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface InboxResponse {
  items: InboxItem[];
  unread_count: number;
  cursor: string | null;
}

export interface TrackedGame {
  device_id: string;
  game_id: string;
  sport: string | null;
  league: string | null;
  notify_flags: Record<string, boolean>;
  created_at: string;
}

export async function fetchInbox(limit = 30, cursor?: string): Promise<InboxResponse> {
  const deviceId = getDeviceId();
  if (!deviceId) return { items: [], unread_count: 0, cursor: null };

  const params = new URLSearchParams({ device_id: deviceId, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${getApiBase()}/v1/notifications/inbox?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Inbox fetch failed: ${res.status}`);
  return res.json();
}

export async function markNotificationsRead(ids?: string[], markAll = false): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  await fetch(`${getApiBase()}/v1/notifications/mark-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      notification_ids: ids,
      mark_all: markAll,
    }),
  });
}

export async function trackGameOnServer(
  gameId: string,
  sport?: string,
  league?: string,
  notifyFlags?: Record<string, boolean>,
): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  await fetch(`${getApiBase()}/v1/tracked-games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      game_id: gameId,
      sport,
      league,
      notify_flags: notifyFlags ?? {
        score: true, lead_change: true, start: true,
        halftime: false, final: true, ot: true, major_events: true,
      },
    }),
  });
}

export async function untrackGameOnServer(gameId: string): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  await fetch(`${getApiBase()}/v1/tracked-games/${gameId}?device_id=${deviceId}`, {
    method: "DELETE",
  });
}

export async function fetchTrackedGames(): Promise<TrackedGame[]> {
  const deviceId = getDeviceId();
  if (!deviceId) return [];

  const res = await fetch(`${getApiBase()}/v1/tracked-games?device_id=${deviceId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  return res.json();
}
