"use client";

import { useEffect, useState } from "react";
import type { LeagueGroup, LeagueInfo } from "@/lib/types";
import { sportIcon } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import {
  getFavoriteLeagues,
  toggleFavoriteLeague,
} from "@/lib/favorites";

interface SidebarProps {
  leagues: LeagueGroup[];
  selectedLeagueId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose?: () => void;
  liveCounts?: Record<string, number>;
  onTodayClick?: () => void;
}

function LeagueLogo({ name, size = 16 }: { name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const url = getLeagueLogo(name);
  if (!url || err) return null;
  return (
    <img
      src={url}
      alt={name}
      className="rounded-sm object-contain"
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}

export function Sidebar({ leagues, selectedLeagueId, onSelect, open, onClose, liveCounts = {}, onTodayClick }: SidebarProps) {
  const [favIds, setFavIds] = useState<string[]>([]);

  useEffect(() => {
    setFavIds(getFavoriteLeagues());
  }, []);

  const handleFavToggle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleFavoriteLeague(id);
    setFavIds(getFavoriteLeagues());
  };

  const allLeagues = leagues.flatMap((g) => g.leagues);
  const favoriteLeagues = allLeagues.filter((l) => favIds.includes(l.id));

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        role="navigation"
        aria-label="League navigation"
        className={`
          fixed inset-y-[44px] left-0 z-50 w-[260px] overflow-y-auto border-r border-surface-border bg-surface-raised
          transition-transform duration-200 ease-out
          md:sticky md:top-[44px] md:z-auto md:h-[calc(100vh-44px)] md:w-[200px] md:min-w-[200px] md:translate-x-0 md:transition-none
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Today button */}
        {onTodayClick && (
          <button
            onClick={onTodayClick}
            className={`
              flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-semibold transition-colors
              ${selectedLeagueId === null
                ? "border-l-2 border-accent-green bg-accent-green/5 text-text-primary"
                : "border-l-2 border-transparent text-text-secondary hover:bg-surface-hover"
              }
            `}
          >
            <span className="text-sm">Today</span>
          </button>
        )}

        <div className="mx-3 border-b border-surface-border" />

        {/* Favorites */}
        {favoriteLeagues.length > 0 && (
          <div className="py-1">
            <div className="px-4 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-accent-amber">
              Favorites
            </div>
            {favoriteLeagues.map((league) => (
              <LeagueButton
                key={`fav-${league.id}`}
                league={league}
                active={selectedLeagueId === league.id}
                onSelect={onSelect}
                onFavToggle={handleFavToggle}
                isFav
                liveCount={liveCounts[league.id] || 0}
              />
            ))}
            <div className="mx-3 my-1 border-b border-surface-border" />
          </div>
        )}

        {/* All leagues */}
        {leagues.map((group) => (
          <div key={group.sport} className="py-0.5">
            <div className="flex items-center gap-1.5 px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-text-dim">
              <span className="text-xs">{sportIcon(group.sport)}</span>
              {group.sport_display}
            </div>

            {group.leagues.map((league) => (
              <LeagueButton
                key={league.id}
                league={league}
                active={selectedLeagueId === league.id}
                onSelect={onSelect}
                onFavToggle={handleFavToggle}
                isFav={favIds.includes(league.id)}
                liveCount={liveCounts[league.id] || 0}
              />
            ))}
          </div>
        ))}

        <div className="h-8" />
      </aside>
    </>
  );
}

function LeagueButton({
  league,
  active,
  onSelect,
  onFavToggle,
  isFav,
  liveCount,
}: {
  league: LeagueInfo;
  active: boolean;
  onSelect: (id: string) => void;
  onFavToggle: (e: React.MouseEvent, id: string) => void;
  isFav: boolean;
  liveCount: number;
}) {
  return (
    <button
      onClick={() => onSelect(league.id)}
      className={`
        group flex w-full items-center gap-1.5 py-1.5 pl-6 pr-3 text-left transition-colors duration-150
        ${active
          ? "border-l-2 border-accent-green bg-accent-green/5 text-text-primary"
          : "border-l-2 border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        }
      `}
    >
      <LeagueLogo name={league.short_name || league.name} />
      <span className="flex-1 truncate text-[12px]">{league.short_name || league.name}</span>

      {liveCount > 0 && (
        <span className="flex items-center gap-0.5 rounded-full bg-accent-red/10 px-1.5 py-0.5 text-[8px] font-bold text-accent-red">
          <span className="relative h-1 w-1">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent-red opacity-75" />
            <span className="relative block h-1 w-1 rounded-full bg-accent-red" />
          </span>
          {liveCount}
        </span>
      )}

      <button
        onClick={(e) => onFavToggle(e, league.id)}
        aria-label={isFav ? `Remove ${league.name} from favorites` : `Add ${league.name} to favorites`}
        aria-pressed={isFav}
        className={`text-[10px] opacity-0 transition-opacity group-hover:opacity-100 ${
          isFav ? "!opacity-100 text-accent-amber" : "text-text-dim hover:text-accent-amber"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </button>
  );
}
