/**
 * Native iOS lock screen notifications via Capacitor.
 * Falls back to Web Notification API on non-native platforms.
 */

import { Capacitor } from "@capacitor/core";

let LocalNotifications: any = null;

async function getPlugin() {
  if (LocalNotifications) return LocalNotifications;
  try {
    const mod = await import("@capacitor/local-notifications");
    LocalNotifications = mod.LocalNotifications;
    return LocalNotifications;
  } catch {
    return null;
  }
}

/**
 * Request notification permission on iOS.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const plugin = await getPlugin();
    if (!plugin) return false;
    const result = await plugin.requestPermissions();
    return result.display === "granted";
  }
  // Web fallback
  if (typeof Notification !== "undefined") {
    const result = await Notification.requestPermission();
    return result === "granted";
  }
  return false;
}

/**
 * Send a notification that shows on iOS lock screen, notification center,
 * and as a banner — even when the app is in the background.
 */
export async function sendScoreNotification(
  title: string,
  body: string,
  matchId?: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const plugin = await getPlugin();
    if (!plugin) return;

    await plugin.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2147483647),
          title,
          body,
          sound: "default",
          smallIcon: "ic_stat_icon",
          iconColor: "#00E676",
          extra: matchId ? { matchId, url: `/match/${matchId}` } : undefined,
          // Show immediately
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    return;
  }

  // Web fallback
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "lv-score-" + Date.now(),
        silent: false,
      });
      setTimeout(() => notif.close(), 8000);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch {}
  }
}

/**
 * Send a periodic score update notification for tracked matches.
 * This shows a summary of all tracked live scores.
 */
export async function sendTrackedScoreSummary(
  games: Array<{ homeName: string; awayName: string; scoreHome: number; scoreAway: number; isLive: boolean; phaseLabel: string }>,
): Promise<void> {
  const liveGames = games.filter((g) => g.isLive);
  if (liveGames.length === 0) return;

  const lines = liveGames
    .map((g) => `${shortName(g.homeName)} ${g.scoreHome}–${g.scoreAway} ${shortName(g.awayName)}`)
    .join("  ·  ");

  const title = `🏟️ ${liveGames.length} live ${liveGames.length === 1 ? "match" : "matches"}`;

  await sendScoreNotification(title, lines);
}

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length > 1) return parts[parts.length - 1].substring(0, 4).toUpperCase();
  return name.substring(0, 4).toUpperCase();
}
