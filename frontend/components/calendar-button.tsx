"use client";

import { useState, useRef, useEffect } from "react";
import type { MatchSummary } from "@/lib/types";
import {
  generateMatchICS,
  generateLeagueICS,
  googleCalendarUrl,
  downloadICS,
} from "@/lib/calendar";

interface CalendarButtonProps {
  match?: MatchSummary;
  matches?: MatchSummary[];
  leagueName: string;
  variant?: "match" | "league";
}

export function CalendarButton({
  match,
  matches,
  leagueName,
  variant = "match",
}: CalendarButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApple = () => {
    if (variant === "match" && match) {
      const ics = generateMatchICS(match, leagueName);
      const safeName = `${match.home_team.short_name}-vs-${match.away_team.short_name}`.toLowerCase();
      downloadICS(ics, `${safeName}.ics`);
    } else if (variant === "league" && matches) {
      const ics = generateLeagueICS(matches, leagueName);
      const safeName = leagueName.toLowerCase().replace(/\s+/g, "-");
      downloadICS(ics, `${safeName}-schedule.ics`);
    }
    setOpen(false);
  };

  const handleGoogle = () => {
    if (variant === "match" && match) {
      const url = googleCalendarUrl(match, leagueName);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } else if (variant === "league" && matches) {
      // Google Calendar doesn't support batch — download ICS instead
      handleApple();
    }
    setOpen(false);
  };

  const hasStartTime = variant === "match" ? !!match?.start_time : (matches || []).some((m) => m.start_time);

  if (!hasStartTime) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-all hover:border-surface-border-light hover:text-text-primary active:scale-95"
      >
        📅 {variant === "league" ? "Export All" : "Calendar"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 animate-scale-in overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-xl">
          <button
            onClick={handleGoogle}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <span className="text-base">📆</span>
            <div>
              <div className="font-medium">Google Calendar</div>
              <div className="text-[10px] text-text-muted">
                {variant === "match" ? "Opens in browser" : "Downloads .ics file"}
              </div>
            </div>
          </button>
          <div className="mx-3 border-t border-surface-border" />
          <button
            onClick={handleApple}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <span className="text-base">🍎</span>
            <div>
              <div className="font-medium">Apple Calendar</div>
              <div className="text-[10px] text-text-muted">Downloads .ics file</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}