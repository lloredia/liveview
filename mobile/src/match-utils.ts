/** Match phase helpers, kept simple — mobile doesn't need every variant. */

export function isLive(phase: string): boolean {
  if (!phase) return false;
  const p = phase.toLowerCase();
  return p.startsWith("live") || p === "break";
}

export function isFinished(phase: string): boolean {
  return phase === "finished" || phase === "full_time" || phase === "post";
}

export function isScheduled(phase: string): boolean {
  return phase === "scheduled" || phase === "pre_match" || phase === "pre";
}

export function phaseShortLabel(phase: string, clock: string | null): string {
  if (!phase) return "";
  if (isFinished(phase)) return "FT";
  if (isLive(phase)) {
    if (phase === "break" || phase === "halftime") return "HT";
    if (clock) return clock;
    return "LIVE";
  }
  if (isScheduled(phase)) return "";
  if (phase === "postponed") return "PP";
  if (phase === "cancelled") return "CC";
  return phase.slice(0, 3).toUpperCase();
}

export function formatStartTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function sportEmoji(sport: string): string {
  const s = (sport || "").toLowerCase();
  if (s === "soccer") return "⚽";
  if (s === "basketball") return "🏀";
  if (s === "baseball") return "⚾";
  if (s === "hockey") return "🏒";
  if (s === "football" || s === "american-football") return "🏈";
  return "";
}
