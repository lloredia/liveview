"use client";

import { useEffect } from "react";
import { SOCCER_PLAYER_DETAIL_STATS } from "./helpers";
import type { PlayerStatLine } from "./types";

interface SoccerPlayerDetailModalProps {
  player: PlayerStatLine;
  teamName: string;
  teamLogo: string | null;
  leagueName: string;
  matchContext: string;
  onClose: () => void;
}

export function SoccerPlayerDetailModal({
  player,
  teamName,
  teamLogo,
  matchContext,
  onClose,
}: SoccerPlayerDetailModalProps) {
  const statValue = (keys: string[], fallback?: string): string => {
    if (fallback != null && keys.length === 0) return fallback;
    for (const k of keys) {
      const v = player.stats[k];
      if (v != null && v !== "" && v !== "-") return String(v);
    }
    return "0";
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Player stats">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-xl">
        <div className="border-b border-surface-border bg-surface-hover/30 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Close">
              ✕
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-lg font-bold text-text-primary">{player.name}</h2>
              <div className="mt-1 flex items-center justify-center gap-2 text-body-sm text-text-secondary">
                {teamLogo && <img src={teamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
                <span className="truncate">{teamName}</span>
                {player.jersey && <span className="font-mono font-semibold text-text-dim">#{player.jersey}</span>}
                {player.position && <span className="text-text-dim">— {player.position}</span>}
              </div>
            </div>
            <div className="w-8 shrink-0" />
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <section className="mb-5">
            <h3 className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-dim">Bio</h3>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-label-lg">
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Height</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Age</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Country</div>
                <div className="text-text-secondary">—</div>
              </div>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-dim">Match stats</h3>
            <p className="mb-3 text-label-md text-text-muted">{matchContext}</p>
            <div className="grid grid-cols-3 gap-2">
              {SOCCER_PLAYER_DETAIL_STATS.map(({ label, keys, fallback }) => (
                <div key={label} className="rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-center">
                  <div className="font-mono text-xl font-bold text-text-primary">{statValue(keys, fallback)}</div>
                  <div className="mt-0.5 text-label-sm font-semibold uppercase text-text-dim">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-label-lg leading-relaxed text-text-secondary">
            Statistics for this match. Season totals and club history can be viewed on the official league or team site.
          </p>
        </div>
      </div>
    </div>
  );
}
