import type { MatchSummary } from "./types";

/**
 * Generate an ICS calendar string for a single match.
 * Works with Google Calendar, Apple Calendar, Outlook, etc.
 */
export function generateMatchICS(match: MatchSummary, leagueName: string): string {
  const start = match.start_time ? toICSDate(new Date(match.start_time)) : "";
  const end = match.start_time ? toICSDate(new Date(new Date(match.start_time).getTime() + 2.5 * 60 * 60 * 1000)) : "";
  const uid = `liveview-${match.id}@liveview.app`;
  const summary = `${match.home_team.name} vs ${match.away_team.name}`;
  const description = `${leagueName}\\n${match.home_team.short_name} vs ${match.away_team.short_name}\\nWatch live on LiveView`;
  const location = match.venue || "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LiveView//Sports Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    "STATUS:CONFIRMED",
    `CATEGORIES:${escapeICS(leagueName)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeICS(summary)} starts in 15 minutes`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Generate an ICS file for multiple matches (e.g. all matches in a league).
 */
export function generateLeagueICS(matches: MatchSummary[], leagueName: string): string {
  const events = matches
    .filter((m) => m.start_time)
    .map((match) => {
      const start = toICSDate(new Date(match.start_time!));
      const end = toICSDate(new Date(new Date(match.start_time!).getTime() + 2.5 * 60 * 60 * 1000));
      const uid = `liveview-${match.id}@liveview.app`;
      const summary = `${match.home_team.name} vs ${match.away_team.name}`;
      const description = `${leagueName}\\n${match.home_team.short_name} vs ${match.away_team.short_name}`;
      const location = match.venue || "";

      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${toICSDate(new Date())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeICS(summary)}`,
        `DESCRIPTION:${escapeICS(description)}`,
        `LOCATION:${escapeICS(location)}`,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeICS(summary)} starts in 15 minutes`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LiveView//Sports Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICS(leagueName)} — LiveView`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Build a Google Calendar URL for a single match (opens in browser).
 */
export function googleCalendarUrl(match: MatchSummary, leagueName: string): string {
  if (!match.start_time) return "";
  const start = toGoogleDate(new Date(match.start_time));
  const end = toGoogleDate(new Date(new Date(match.start_time).getTime() + 2.5 * 60 * 60 * 1000));
  const title = `${match.home_team.name} vs ${match.away_team.name}`;
  const details = `${leagueName}\n${match.home_team.short_name} vs ${match.away_team.short_name}\nWatch live on LiveView`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details,
    location: match.venue || "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Trigger .ics file download in the browser. */
export function downloadICS(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function toGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace("Z", "Z");
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}