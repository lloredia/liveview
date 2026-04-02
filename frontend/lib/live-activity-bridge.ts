import { Capacitor } from "@capacitor/core";

export async function updateLiveActivity(games: Array<{
  matchId: string;
  homeName: string;
  awayName: string;
  scoreHome: number;
  scoreAway: number;
  isLive: boolean;
  phaseLabel: string;
}>) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await (Capacitor.Plugins as any).LiveActivityPlugin.updateTrackedGames({ games });
  } catch {}
}

export async function endLiveActivity() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await (Capacitor.Plugins as any).LiveActivityPlugin.endLiveActivity();
  } catch {}
}
