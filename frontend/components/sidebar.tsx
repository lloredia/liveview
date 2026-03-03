"use client";

import { useEffect, useState } from "react";
import type { LeagueGroup, LeagueInfo } from "@/lib/types";
import { sportIcon } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import {
  getFavoriteLeagues,
  toggleFavoriteLeague,
} from "@/lib/favorites";
import { hapticSelection } from "@/lib/haptics";
import { GlassPill, GlassDivider } from "./ui/glass";

interface SidebarProps {
  leagues: LeagueGroup[];
  selectedLeagueId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose?: () => void;
  liveCounts?: Record<string, number>;
  onTodayClick?: () => void;
}

function LeagueLogo({ name, apiLogoUrl, size = 16 }: { name: string; apiLogoUrl?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const url = getLeagueLogo(name, apiLogoUrl);
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
    hapticSelection();
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
          className="fixed inset-0 z-40 bg-black/50 glass-blur-light md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        role="navigation"
        aria-label="League navigation"
        className={`
          fixed inset-y-[44px] left-0 z-50 w-[260px] overflow-y-auto
          glass-surface-elevated glass-blur border-r border-glass-border
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
              flex w-full items-center gap-2 px-4 py-2.5 text-left text-label-lg transition-all duration-150 glass-press
              ${selectedLeagueId === null
                ? "border-l-2 border-accent-green bg-accent-green/8 text-text-primary"
                : "border-l-2 border-transparent text-text-secondary hover:bg-glass-hover"
              }
            `}
          >
            <span className="text-body-sm font-semibold">Today</span>
          </button>
        )}

        <GlassDivider className="mx-3" />

        {/* Favorites */}
        {favoriteLeagues.length > 0 && (
          <div className="py-1">
            <div className="px-4 pb-1 pt-2 text-label-xs uppercase tracking-[0.12em] text-accent-amber">
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
            <GlassDivider className="mx-3 my-1" />
          </div>
        )}

        {/* All leagues */}
        {leagues.map((group) => (
          <div key={group.sport} className="py-0.5">
            <div className="flex items-center gap-1.5 px-4 py-1.5 text-label-xs uppercase tracking-[0.12em] text-text-dim">
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
        group flex w-full items-center gap-1.5 py-1.5 pl-6 pr-3 text-left transition-all duration-150 glass-press
        ${active
          ? "border-l-2 border-accent-green bg-accent-green/8 text-text-primary"
          : "border-l-2 border-transparent text-text-secondary hover:bg-glass-hover hover:text-text-primary"
        }
      `}
    >
      <LeagueLogo name={league.short_name || league.name} apiLogoUrl={league.logo_url} />
      <span className="flex-1 truncate text-label-lg">{league.short_name || league.name}</span>

      {liveCount > 0 && (
        <GlassPill variant="live" size="xs" pulse>
          {liveCount}
        </GlassPill>
      )}

      <button
        onClick={(e) => onFavToggle(e, league.id)}
        aria-label={isFav ? `Remove ${league.name} from favorites` : `Add ${league.name} to favorites`}
        aria-pressed={isFav}
        className={`text-label-sm opacity-0 transition-opacity group-hover:opacity-100 ${
          isFav ? "!opacity-100 text-accent-amber" : "text-text-dim hover:text-accent-amber"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </button>
  );
}
