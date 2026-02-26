/** Parse minute from a soccer-style clock (e.g. "111'", "45+3'", "HT"). Returns null if unparseable. */
export function parseSoccerClockMinute(clock: string | null | undefined): number | null {
  if (!clock || typeof clock !== "string") return null;
  const trimmed = clock.trim();
  const plusMatch = trimmed.match(/^(\d+)\s*\+\s*(\d+)\s*'?/);
  if (plusMatch) return parseInt(plusMatch[1], 10) + parseInt(plusMatch[2], 10);
  const simpleMatch = trimmed.match(/(\d+)\s*'?/);
  return simpleMatch ? parseInt(simpleMatch[1], 10) : null;
}

/** Map a phase string to a human-readable label. */
export function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    scheduled: "Scheduled",
    pre_match: "Pre-Match",
    live_first_half: "1st Half",
    live_halftime: "Half Time",
    live_second_half: "2nd Half",
    live_extra_time: "Extra Time",
    live_penalties: "Penalties",
    live_q1: "Q1",
    live_q2: "Q2",
    live_q3: "Q3",
    live_q4: "Q4",
    live_ot: "Overtime",
    live_p1: "1st Period",
    live_p2: "2nd Period",
    live_p3: "3rd Period",
    live_inning: "In Play",
    break: "Break",
    suspended: "Suspended",
    finished: "Full Time",
    postponed: "Postponed",
    cancelled: "Cancelled",
  };
  return map[phase] || phase;
}

/**
 * Phase label that never shows "1st Half" when the clock indicates a later period (soccer).
 * Use when displaying phase + clock together to avoid e.g. "1st Half · 111'".
 */
export function phaseLabelWithClock(
  phase: string,
  clock: string | null | undefined,
): string {
  const base = phaseLabel(phase);
  if (phase !== "live_first_half") return base;
  const minute = parseSoccerClockMinute(clock);
  if (minute == null) return base;
  if (minute > 90) return "Extra Time";
  if (minute > 45) return "2nd Half";
  return base;
}

/** Returns true if the match is currently in play. */
export function isLive(phase: string | undefined | null): boolean {
  if (!phase) return false;
  return phase.startsWith("live_") || phase === "break";
}

/** Short period label for live badges (Q1, Q2, HT, P1, 1H, etc.) */
export function phaseShortLabel(phase: string): string {
  const map: Record<string, string> = {
    live_q1: "Q1",
    live_q2: "Q2",
    live_q3: "Q3",
    live_q4: "Q4",
    live_ot: "OT",
    live_first_half: "1H",
    live_second_half: "2H",
    live_halftime: "HT",
    live_extra_time: "ET",
    live_penalties: "PEN",
    live_p1: "P1",
    live_p2: "P2",
    live_p3: "P3",
    live_inning: "LIVE",
    break: "HT",
  };
  return map[phase] || "LIVE";
}

/**
 * Short phase label that never shows "1H" when clock indicates 2nd half or extra time (soccer).
 * Use for list/card badges so we don't show "1H 120'".
 */
export function phaseShortLabelWithClock(
  phase: string,
  clock: string | null | undefined,
): string {
  if (phase !== "live_first_half") return phaseShortLabel(phase);
  const minute = parseSoccerClockMinute(clock);
  if (minute == null) return phaseShortLabel(phase);
  if (minute > 90) return "ET";
  if (minute > 45) return "2H";
  return "1H";
}

/** Returns a Tailwind-friendly CSS class for the phase color. */
export function phaseColorClass(phase: string): string {
  if (isLive(phase)) return "text-accent-green";
  if (phase === "finished") return "text-text-secondary";
  if (phase === "scheduled") return "text-accent-blue";
  return "text-accent-red";
}

/** Returns a raw hex color for the phase. */
export function phaseColor(phase: string): string {
  if (isLive(phase)) return "#00E676";
  if (phase === "finished") return "#B8B8CC";
  if (phase === "scheduled") return "#448AFF";
  return "#FF1744";
}

/** Format an ISO timestamp as a localized time (e.g., "8:00 PM"). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format an ISO timestamp as a short date (e.g., "Sun, Feb 16"). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Format an ISO timestamp as relative time (e.g., "in 2 hours", "3 min ago"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now;
  const absDiff = Math.abs(diffMs);
  const mins = Math.floor(absDiff / 60000);
  const hours = Math.floor(absDiff / 3600000);
  const days = Math.floor(absDiff / 86400000);

  if (diffMs > 0) {
    if (mins < 60) return `in ${mins}m`;
    if (hours < 24) return `in ${hours}h`;
    return `in ${days}d`;
  } else {
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

/** Map sport type to an emoji icon (football = American football 🏈). */
export function sportIcon(sport: string): string {
  const map: Record<string, string> = {
    soccer: "⚽",
    basketball: "🏀",
    hockey: "🏒",
    baseball: "⚾",
    football: "🏈",
  };
  return map[(sport || "").toLowerCase()] || "🏆";
}

/** Map event_type to a display-friendly label and icon. */
export function eventMeta(eventType: string): { label: string; icon: string; color: string } {
  const map: Record<string, { label: string; icon: string; color: string }> = {
    goal: { label: "Goal", icon: "⚽", color: "#00ff87" },
    assist: { label: "Assist", icon: "👟", color: "#5b9cf6" },
    yellow_card: { label: "Yellow Card", icon: "🟨", color: "#ffb347" },
    red_card: { label: "Red Card", icon: "🟥", color: "#ff6b6b" },
    substitution: { label: "Substitution", icon: "🔄", color: "#5b9cf6" },
    penalty: { label: "Penalty", icon: "⚽", color: "#00ff87" },
    penalty_miss: { label: "Penalty Miss", icon: "❌", color: "#ff6b6b" },
    own_goal: { label: "Own Goal", icon: "⚽", color: "#ff6b6b" },
    var_decision: { label: "VAR", icon: "📺", color: "#ffb347" },
    period_start: { label: "Period Start", icon: "▶", color: "#5b9cf6" },
    period_end: { label: "Period End", icon: "⏸", color: "#5b9cf6" },
    match_start: { label: "Kick-off", icon: "▶", color: "#00ff87" },
    match_end: { label: "Full Time", icon: "🏁", color: "#8b95a5" },
    basket: { label: "Basket", icon: "🏀", color: "#00ff87" },
    three_pointer: { label: "3-Pointer", icon: "🏀", color: "#00ff87" },
    home_run: { label: "Home Run", icon: "⚾", color: "#00ff87" },
    timeout: { label: "Timeout", icon: "⏱", color: "#ffb347" },
  };
  return map[eventType] || { label: eventType.replace(/_/g, " "), icon: "•", color: "#5b6b7b" };
}
