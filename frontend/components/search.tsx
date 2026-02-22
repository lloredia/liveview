"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLeagues, fetchScoreboard } from "@/lib/api";
import type { LeagueGroup, MatchSummary } from "@/lib/types";
import { TeamLogo } from "./team-logo";
import { isLive, phaseLabel } from "@/lib/utils";

interface SearchProps {
  onLeagueSelect: (leagueId: string) => void;
  onMatchSelect: (matchId: string, leagueName?: string) => void;
}

interface SearchResult {
  type: "league" | "team" | "match";
  id: string;
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  leagueName?: string;
  live?: boolean;
}

export function Search({ onLeagueSelect, onMatchSelect }: SearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<SearchResult[]>([]);
  const builtRef = useRef(false);

  // Build search index on first open
  const buildIndex = useCallback(async () => {
    if (builtRef.current) return;
    builtRef.current = true;
    setSearching(true);

    try {
      const groups = await fetchLeagues();
      const allResults: SearchResult[] = [];

      // Add leagues
      for (const group of groups) {
        for (const league of group.leagues) {
          allResults.push({
            type: "league",
            id: league.id,
            title: league.name,
            subtitle: group.sport,
            logoUrl: null,
          });
        }
      }

      // Add teams and matches from each league
      const leagueIds = groups.flatMap((g) => g.leagues.map((l) => ({ id: l.id, name: l.name })));

      for (let i = 0; i < leagueIds.length; i += 5) {
        const batch = leagueIds.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map((l) => fetchScoreboard(l.id)),
        );

        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status !== "fulfilled") continue;
          const scoreboard = r.value;
          const leagueName = batch[j].name;
          const seenTeams = new Set<string>();

          for (const match of scoreboard.matches) {
            // Add match
            allResults.push({
              type: "match",
              id: match.id,
              title: `${match.home_team.short_name} vs ${match.away_team.short_name}`,
              subtitle: `${leagueName} · ${phaseLabel(match.phase)}`,
              leagueName,
              live: isLive(match.phase),
            });

            // Add teams (deduplicated)
            for (const team of [match.home_team, match.away_team]) {
              if (seenTeams.has(team.name)) continue;
              seenTeams.add(team.name);
              allResults.push({
                type: "team",
                id: match.id,
                title: team.name,
                subtitle: leagueName,
                logoUrl: team.logo_url,
                leagueName,
              });
            }
          }
        }
      }

      cacheRef.current = allResults;
    } catch {
      // Silently fail — search just won't have results
    }

    setSearching(false);
  }, []);

  // Filter results on query change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }

    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/);

    const filtered = cacheRef.current
      .filter((r) => {
        const haystack = `${r.title} ${r.subtitle}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
      .sort((a, b) => {
        // Live matches first
        if (a.live && !b.live) return -1;
        if (!a.live && b.live) return 1;
        // Exact starts first
        const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        // Leagues, then teams, then matches
        const order = { league: 0, team: 1, match: 2 };
        return order[a.type] - order[b.type];
      })
      .slice(0, 12);

    setResults(filtered);
    setSelectedIdx(0);
  }, [query]);

  // Keyboard shortcut: Cmd/Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      buildIndex();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open, buildIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      if (result.type === "league") {
        onLeagueSelect(result.id);
      } else {
        onMatchSelect(result.id, result.leagueName);
      }
    },
    [onLeagueSelect, onMatchSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    }
  };

  const typeIcon = (type: string) => {
    if (type === "league") return "🏆";
    if (type === "team") return "👕";
    return "⚽";
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-[12px] text-text-muted transition-colors hover:border-surface-border-light hover:text-text-secondary"
      >
        <span>🔍</span>
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden rounded border border-surface-border bg-surface-raised px-1.5 py-0.5 text-[9px] font-semibold text-text-dim sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div
            ref={containerRef}
            className="relative z-10 w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl"
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
              <span className="text-text-muted">🔍</span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search teams, matches, leagues..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-[14px] text-text-primary placeholder-text-muted outline-none"
              />
              {searching && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
              )}
              <kbd
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-text-dim hover:bg-surface-hover"
              >
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto">
              {query && results.length === 0 && !searching && (
                <div className="px-4 py-8 text-center text-[13px] text-text-tertiary">
                  No results for &quot;{query}&quot;
                </div>
              )}

              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}-${i}`}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIdx
                      ? "bg-surface-hover text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover/50"
                  }`}
                >
                  {r.logoUrl ? (
                    <TeamLogo url={r.logoUrl} name={r.title} size={24} />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center text-sm">
                      {typeIcon(r.type)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{r.title}</div>
                    <div className="truncate text-[10px] text-text-muted">{r.subtitle}</div>
                  </div>
                  {r.live && (
                    <div className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      <span className="text-[9px] font-bold text-red-400">LIVE</span>
                    </div>
                  )}
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[9px] font-semibold uppercase text-text-dim">
                    {r.type}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer hint */}
            {!query && (
              <div className="border-t border-surface-border px-4 py-3 text-center text-[11px] text-text-muted">
                Type to search across all leagues, teams, and matches
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}