/**
 * Syncs tracked live games to the iOS Dynamic Island / Live Activity.
 * Uses the Capacitor bridge via @capacitor/core for reliable plugin access.
 *
 * Re-exports from live-activity-bridge.ts which is the canonical bridge file.
 */

export { updateLiveActivity, endLiveActivity } from "./live-activity-bridge";

export interface LiveGamePayload {
  matchId: string;
  homeName: string;
  awayName: string;
  scoreHome: number;
  scoreAway: number;
  isLive: boolean;
  phaseLabel: string;
}
