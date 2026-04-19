"use client";

import { useMemo, useState } from "react";
import type { LeagueGroup, LeagueInfo } from "@/lib/types";
import { sportIcon } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
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
  /** When provided, show favorites section and use these + onToggleFavoriteLeague (gated) */
  favoriteLeagueIds?: string[];
  onToggleFavoriteLeague?: (leagueId: string) => void;
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

export function Sidebar({
  leagues,
  selectedLeagueId,
  onSelect,
  open,
  onClose,
  liveCounts = {},
  onTodayClick,
  favoriteLeagueIds = [],
  onToggleFavoriteLeague,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return leagues;
    return leagues
      .map((group) => ({
        ...group,
        leagues: group.leagues.filter((l) => {
          const name = (l.short_name || l.name || "").toLowerCase();
          const full = (l.name || "").toLowerCase();
          return name.includes(normalizedQuery) || full.includes(normalizedQuery);
        }),
      }))
      .filter((group) => group.leagues.length > 0);
  }, [leagues, normalizedQuery]);

  const allLeagues = leagues.flatMap((g) => g.leagues);
  const favoriteLeagues = allLeagues.filter((l) => favoriteLeagueIds.includes(l.id));
  const filteredFavorites = normalizedQuery
    ? favoriteLeagues.filter((l) => {
        const name = (l.short_name || l.name || "").toLowerCase();
        const full = (l.name || "").toLowerCase();
        return name.includes(normalizedQuery) || full.includes(normalizedQuery);
      })
    : favoriteLeagues;

  const handleFavToggle = (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.stopPropagation();
    hapticSelection();
    onToggleFavoriteLeague?.(id);
  };

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
        {/* Today button — always visible regardless of search filter */}
        {onTodayClick && (
          <button
            onClick={onTodayClick}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className={`
              flex w-full items-center gap-2 px-4 py-2.5 text-left text-label-lg transition-all duration-150 glass-press touch-manipulation
              ${selectedLeagueId === null
                ? "border-l-2 border-accent-green bg-accent-green/8 text-text-primary"
                : "border-l-2 border-transparent text-text-secondary [@media(hover:hover)]:hover:bg-glass-hover"
              }
            `}
          >
            <span className="text-body-sm font-semibold">Today</span>
          </button>
        )}

        <GlassDivider className="mx-3" />

        {/* Search / filter input */}
        <div className="px-3 pb-2 pt-2">
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leagues"
            aria-label="Search leagues"
            className="w-full rounded-md border border-glass-border bg-glass-hover/40 px-2.5 py-1.5 text-body-sm text-text-primary placeholder:text-text-dim focus:border-accent-green focus:outline-none"
          />
        </div>

        {/* Favorites */}
        {filteredFavorites.length > 0 && (
          <div className="py-1">
            <div className="px-4 pb-1 pt-2 text-label-xs uppercase tracking-[0.12em] text-accent-amber">
              Favorites
            </div>
            {filteredFavorites.map((league) => (
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

        {/* All leagues (filtered) */}
        {filteredGroups.map((group) => (
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
                isFav={favoriteLeagueIds.includes(league.id)}
                liveCount={liveCounts[league.id] || 0}
              />
            ))}
          </div>
        ))}

        {normalizedQuery && filteredGroups.length === 0 && filteredFavorites.length === 0 && (
          <div className="px-4 py-3 text-body-sm text-text-dim">
            No leagues match &ldquo;{query}&rdquo;.
          </div>
        )}

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
  onFavToggle: (e: React.MouseEvent | React.KeyboardEvent, id: string) => void;
  isFav: boolean;
  liveCount: number;
}) {
  const favVisible = isFav;

  return (
    <div
      className={`
        group relative w-full transition-all duration-150
        ${active
          ? "border-l-2 border-accent-green bg-accent-green/8"
          : "border-l-2 border-transparent [@media(hover:hover)]:hover:bg-glass-hover"
        }
      `}
    >
      <button
        onClick={() => onSelect(league.id)}
        style={{ WebkitTapHighlightColor: "transparent" }}
        className={`
          flex w-full items-center gap-1.5 py-1.5 pl-6 pr-10 text-left glass-press touch-manipulation
          ${active
            ? "text-text-primary"
            : "text-text-secondary [@media(hover:hover)]:hover:text-text-primary"
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
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFavToggle(e, league.id);
        }}
        aria-label={isFav ? `Remove ${league.name} from favorites` : `Add ${league.name} to favorites`}
        aria-pressed={isFav}
        tabIndex={favVisible ? 0 : -1}
        style={{ WebkitTapHighlightColor: "transparent" }}
        className={`absolute right-3 top-1/2 -translate-y-1/2 select-none text-label-sm transition-opacity touch-manipulation ${
          favVisible
            ? "opacity-100 text-accent-amber"
            : "pointer-events-none opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 text-text-dim [@media(hover:hover)]:hover:text-accent-amber"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </div>
  );
}
