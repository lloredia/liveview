/**
 * Syncs tracked live games to the iOS Dynamic Island / Live Activity.
 * No-op when not running in the native iOS app.
 */

export interface LiveGamePayload {
  matchId: string;
  homeName: string;
  awayName: string;
  scoreHome: number;
  scoreAway: number;
  isLive: boolean;
  phaseLabel: string;
}

export async function updateLiveActivity(games: LiveGamePayload[]): Promise<void> {
  if (typeof window === "undefined") return;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LiveActivityPlugin?: { updateTrackedGames: (opts: { games: LiveGamePayload[] }) => Promise<void>; endLiveActivity: () => Promise<void> } }; getPlatform?: () => string } }).Capacitor;
  if (!cap?.Plugins?.LiveActivityPlugin || cap.getPlatform?.() !== "ios") return;
  try {
    await cap.Plugins.LiveActivityPlugin.updateTrackedGames({ games });
  } catch {
    // Live Activity may not be available (e.g. simulator without widget)
  }
}

export async function endLiveActivity(): Promise<void> {
  if (typeof window === "undefined") return;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LiveActivityPlugin?: { endLiveActivity: () => Promise<void> } }; getPlatform?: () => string } }).Capacitor;
  if (!cap?.Plugins?.LiveActivityPlugin || cap.getPlatform?.() !== "ios") return;
  try {
    await cap.Plugins.LiveActivityPlugin.endLiveActivity();
  } catch {
    // ignore
  }
}
