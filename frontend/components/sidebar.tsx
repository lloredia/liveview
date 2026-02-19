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
  liveCounts?: Record<string, number>;
  onTodayClick?: () => void;
}

function LeagueLogo({ name, size = 20 }: { name: string; size?: number }) {
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

export function Sidebar({ leagues, selectedLeagueId, onSelect, open, liveCounts = {}, onTodayClick }: SidebarProps) {
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

  if (!open) return null;

  return (
    <aside className="sticky top-[45px] h-[calc(100vh-45px)] w-[220px] min-w-[220px] animate-fade-in overflow-y-auto border-r border-surface-border bg-surface-raised max-md:fixed max-md:inset-y-[45px] max-md:left-0 max-md:z-50 max-md:w-[260px] max-md:shadow-2xl">
      {/* Today button */}
      {onTodayClick && (
        <button
          onClick={onTodayClick}
          className={`
            flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-semibold transition-all duration-150
            ${selectedLeagueId === null
              ? "border-l-2 border-accent-green bg-gradient-to-r from-accent-green/7 to-transparent text-text-primary"
              : "border-l-2 border-transparent text-text-secondary hover:bg-surface-hover/50 hover:text-text-primary"
            }
          `}
        >
          <span className="text-base">📅</span>
          <span>Today</span>
        </button>
      )}

      <div className="mx-4 my-1 border-b border-surface-border" />

      {/* Favorites section */}
      {favoriteLeagues.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-amber">
            ⭐ Favorites
          </div>
          {favoriteLeagues.map((league) => (
            <LeagueButton
              key={`fav-${league.id}`}
              league={league}
              active={selectedLeagueId === league.id}
              onSelect={onSelect}
              onFavToggle={handleFavToggle}
              isFav={true}
              liveCount={liveCounts[league.id] || 0}
            />
          ))}
          <div className="mx-4 my-2 border-b border-surface-border" />
        </div>
      )}

      <div className="px-4 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
        Leagues
      </div>

      {leagues.map((group) => (
        <div key={group.sport} className="mb-1">
          <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            <span className="text-sm">{sportIcon(group.sport)}</span>
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
    </aside>
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
        group flex w-full items-center gap-2 text-left transition-all duration-150
        ${active
          ? "border-l-2 border-accent-green bg-gradient-to-r from-accent-green/7 to-transparent py-2 pl-7 pr-3 text-[13px] font-semibold text-text-primary"
          : "border-l-2 border-transparent py-2 pl-7 pr-3 text-[13px] text-text-secondary hover:bg-surface-hover/50 hover:text-text-primary"
        }
      `}
    >
      <LeagueLogo name={league.short_name || league.name} size={18} />
      <span className="flex-1 truncate">{league.short_name || league.name}</span>

      {/* Live count badge */}
      {liveCount > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
          <span className="relative h-1 w-1">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative block h-1 w-1 rounded-full bg-red-500" />
          </span>
          {liveCount}
        </span>
      )}

      {/* Favorite star */}
      <button
        onClick={(e) => onFavToggle(e, league.id)}
        className={`text-xs opacity-0 transition-opacity group-hover:opacity-100 ${
          isFav ? "!opacity-100 text-accent-amber" : "text-text-muted hover:text-accent-amber"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </button>
  );
}