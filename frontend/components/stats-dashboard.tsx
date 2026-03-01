"use client";

import { useEffect, useState } from "react";
import { TeamLogo } from "./team-logo";

interface StatsDashboardProps {
  leagueName: string;
  leagueShortName: string;
}

interface LeaderEntry {
  rank: number;
  name: string;
  team: string;
  teamLogo: string;
  value: string;
  category: string;
  headshot?: string;
}

interface TeamFormEntry {
  rank: number;
  name: string;
  logo: string;
  form: string[];
  wins: number;
  losses: number;
  pct: string;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  record: string;
}

interface LeagueStats {
  leaders: LeaderEntry[];
  leaderCategories: string[];
  teamForm: TeamFormEntry[];
  totalPoints: number;
  totalMatches: number;
  avgPointsPerGame: number;
  homeWinPct: number;
  awayWinPct: number;
  drawPct: number;
  sport: string;
}

const LEAGUE_ESPN: Record<string, { sport: string; slug: string }> = {
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
};

function sportLabel(sport: string, key: "points" | "ppg" | "matches") {
  if (key === "points") {
    if (sport === "soccer") return "Total Goals";
    if (sport === "baseball") return "Total Runs";
    return "Total Points";
  }
  if (key === "ppg") {
    if (sport === "soccer") return "Goals / Game";
    if (sport === "baseball") return "Runs / Game";
    return "Points / Game";
  }
  return "Completed";
}

function sportIcon(sport: string) {
  if (sport === "basketball") return "🏀";
  if (sport === "hockey") return "🏒";
  if (sport === "baseball") return "⚾";
  return "⚽";
}

export function StatsDashboard({ leagueName, leagueShortName }: StatsDashboardProps) {
  const [stats, setStats] = useState<LeagueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLeaderCat, setActiveLeaderCat] = useState(0);

  useEffect(() => {
    const info = LEAGUE_ESPN[leagueName] || LEAGUE_ESPN[leagueShortName];
    if (!info) return;

    setLoading(true);
    setStats(null);
    setActiveLeaderCat(0);

    (async () => {
      try {
        const { sport, slug } = info;
        const prefix = sport === "soccer" ? "soccer/" + slug : sport + "/" + slug;

        const sbUrl = "/api/espn/site/" + prefix + "/scoreboard";
        const sbRes = await fetch(sbUrl);
        const sbData = sbRes.ok ? await sbRes.json() : { events: [] };
        const events: any[] = sbData.events || [];

        let totalPoints = 0;
        let totalMatches = 0;
        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;

        for (const evt of events) {
          const comp = evt.competitions?.[0];
          if (!comp) continue;
          if (!comp.status?.type?.completed) continue;

          totalMatches++;
          const competitors = comp.competitors || [];
          const home = competitors.find((c: any) => c.homeAway === "home");
          const away = competitors.find((c: any) => c.homeAway === "away");

          if (home && away) {
            const hs = parseInt(home.score || "0", 10);
            const as_ = parseInt(away.score || "0", 10);
            totalPoints += hs + as_;
            if (hs > as_) homeWins++;
            else if (as_ > hs) awayWins++;
            else draws++;
          }
        }

        const avgPointsPerGame = totalMatches > 0 ? totalPoints / totalMatches : 0;
        const homeWinPct = totalMatches > 0 ? (homeWins / totalMatches) * 100 : 0;
        const awayWinPct = totalMatches > 0 ? (awayWins / totalMatches) * 100 : 0;
        const drawPct = totalMatches > 0 ? (draws / totalMatches) * 100 : 0;

        // Leaders from scoreboard
        const leaders: LeaderEntry[] = [];
        const leaderCategories: string[] = [];

        // For all sports, try to get leaders from completed games
        for (const evt of events) {
          const comp = evt.competitions?.[0];
          if (!comp) continue;
          const competitors = comp.competitors || [];
          for (const c of competitors) {
            const teamLeaders = c.leaders || [];
            for (const cat of teamLeaders) {
              const catName = cat.displayName || cat.name || "";
              if (!catName || catName === "Rating") continue;
              if (!leaderCategories.includes(catName)) leaderCategories.push(catName);

              for (const l of cat.leaders || []) {
                const ath = l.athlete || {};
                leaders.push({
                  rank: 0,
                  name: ath.displayName || ath.fullName || "Unknown",
                  team: ath.team?.abbreviation || c.team?.abbreviation || "",
                  teamLogo: c.team?.logo || ath.team?.logos?.[0]?.href || "",
                  value: l.displayValue || String(l.value || ""),
                  category: catName,
                  headshot: ath.headshot || "",
                });
              }
            }
          }
        }

        // Deduplicate and rank by value within each category
        const seenLeaders = new Map<string, LeaderEntry>();
        for (const l of leaders) {
          const key = `${l.category}:${l.name}`;
          const existing = seenLeaders.get(key);
          if (!existing || parseFloat(l.value) > parseFloat(existing.value)) {
            seenLeaders.set(key, l);
          }
        }

        const uniqueLeaders = Array.from(seenLeaders.values());
        for (const cat of leaderCategories) {
          const catLeaders = uniqueLeaders
            .filter((l) => l.category === cat)
            .sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
          catLeaders.forEach((l, i) => (l.rank = i + 1));
        }

        // Team form from standings
        const standUrl = "/api/espn/v2/" + prefix + "/standings";
        const standRes = await fetch(standUrl);
        const standData = standRes.ok ? await standRes.json() : null;

        const teamForm: TeamFormEntry[] = [];
        if (standData?.children) {
          for (const group of standData.children) {
            for (const entry of group.standings?.entries || []) {
              const team = entry.team || {};
              const entryStats: Record<string, number> = {};
              for (const s of entry.stats || []) {
                entryStats[s.name] = Number(s.value) || 0;
              }
              const streakStr = (entry.stats || []).find(
                (s: any) => s.name === "streak" || s.abbreviation === "STRK"
              )?.displayValue || "";

              const wins = entryStats["wins"] || entryStats["W"] || 0;
              const losses = entryStats["losses"] || entryStats["L"] || 0;
              const d = entryStats["ties"] || entryStats["draws"] || entryStats["D"] || 0;
              const gp = entryStats["gamesPlayed"] || entryStats["GP"] || wins + losses + d;
              const pf = entryStats["pointsFor"] || entryStats["PF"] || entryStats["goalsFor"] || 0;
              const pa = entryStats["pointsAgainst"] || entryStats["PA"] || entryStats["goalsAgainst"] || 0;
              const pct = gp > 0 ? (wins / gp) : 0;

              const form: string[] = [];
              for (const ch of (streakStr || "").slice(0, 5)) {
                if ("Ww".includes(ch)) form.push("W");
                else if ("Ll".includes(ch)) form.push("L");
                else if ("DdTt".includes(ch)) form.push("D");
              }

              teamForm.push({
                rank: 0,
                name: team.displayName || team.name || "",
                logo: team.logos?.[0]?.href || "",
                form,
                wins,
                losses,
                pct: pct.toFixed(3).replace(/^0/, ""),
                pointsFor: pf,
                pointsAgainst: pa,
                diff: pf - pa,
                record: sport === "soccer"
                  ? `${wins}-${d}-${losses}`
                  : `${wins}-${losses}`,
              });
            }
          }
        }

        teamForm.sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct) || b.diff - a.diff);
        teamForm.forEach((t, i) => (t.rank = i + 1));

        setStats({
          leaders: uniqueLeaders,
          leaderCategories,
          teamForm: teamForm.slice(0, 20),
          totalPoints,
          totalMatches,
          avgPointsPerGame,
          homeWinPct,
          awayWinPct,
          drawPct,
          sport,
        });
      } catch {
        // Stats optional
      }
      setLoading(false);
    })();
  }, [leagueName, leagueShortName]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4">
              <div className="mb-3 h-2 w-14 animate-pulse rounded bg-surface-hover" />
              <div className="h-6 w-16 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-card p-4">
          <div className="mb-3 h-3 w-32 animate-pulse rounded bg-surface-hover" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-surface-hover" />
              <div className="flex-1">
                <div className="mb-1 h-3 w-24 animate-pulse rounded bg-surface-hover" />
                <div className="h-2 w-16 animate-pulse rounded bg-surface-hover" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">📊</div>
        <div className="text-[14px] font-semibold text-text-secondary">No Stats Available</div>
        <div className="mt-1 text-[12px] text-text-muted">Check back when games are in progress</div>
      </div>
    );
  }

  const hasDraw = stats.sport === "soccer";
  const catLeaders = stats.leaderCategories.length > 0
    ? stats.leaders.filter((l) => l.category === stats.leaderCategories[activeLeaderCat]).slice(0, 10)
    : [];

  return (
    <div className="animate-fade-in space-y-4">
      {/* Hero stats row */}
      <div className="grid grid-cols-3 gap-2.5">
        <HeroCard
          label={sportLabel(stats.sport, "matches")}
          value={String(stats.totalMatches)}
          accent="blue"
        />
        <HeroCard
          label={sportLabel(stats.sport, "ppg")}
          value={stats.avgPointsPerGame.toFixed(1)}
          accent="green"
        />
        <HeroCard
          label="Home Win %"
          value={stats.homeWinPct.toFixed(0) + "%"}
          accent="amber"
        />
      </div>

      {/* Result distribution */}
      {stats.totalMatches > 0 && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="px-4 py-3">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
              Result Distribution
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-hover/50">
              <div
                className="rounded-l-full transition-all duration-500"
                style={{
                  width: `${stats.homeWinPct}%`,
                  background: "linear-gradient(90deg, #059669, #00E676)",
                }}
              />
              {hasDraw && (
                <div
                  className="transition-all duration-500"
                  style={{
                    width: `${stats.drawPct}%`,
                    background: "linear-gradient(90deg, #d97706, #FFD740)",
                  }}
                />
              )}
              <div
                className="rounded-r-full transition-all duration-500"
                style={{
                  width: `${stats.awayWinPct}%`,
                  background: "linear-gradient(90deg, #3b82f6, #448AFF)",
                }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-accent-green" />
                <span className="font-semibold text-text-secondary">Home</span>
                <span className="font-mono font-bold text-text-primary">{stats.homeWinPct.toFixed(0)}%</span>
              </div>
              {hasDraw && (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-accent-amber" />
                  <span className="font-semibold text-text-secondary">Draw</span>
                  <span className="font-mono font-bold text-text-primary">{stats.drawPct.toFixed(0)}%</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-accent-blue" />
                <span className="font-semibold text-text-secondary">Away</span>
                <span className="font-mono font-bold text-text-primary">{stats.awayWinPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaders section */}
      {stats.leaderCategories.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-4 py-3">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
              Game Leaders
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {stats.leaderCategories.map((cat, i) => (
                <button
                  key={cat}
                  onClick={() => setActiveLeaderCat(i)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    i === activeLeaderCat
                      ? "bg-accent-blue/10 text-accent-blue ring-1 ring-accent-blue/20"
                      : "bg-surface-hover/40 text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Top leader highlight */}
          {catLeaders[0] && (
            <div className="flex items-center gap-4 border-b border-surface-border bg-gradient-to-r from-accent-blue/[0.04] to-transparent px-4 py-4">
              {catLeaders[0].headshot ? (
                <img
                  src={catLeaders[0].headshot}
                  alt={catLeaders[0].name}
                  className="h-14 w-14 rounded-full border-2 border-accent-blue/20 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hover text-xl">
                  {sportIcon(stats.sport)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-text-primary">
                  {catLeaders[0].name}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-text-muted">
                  {catLeaders[0].teamLogo && (
                    <TeamLogo url={catLeaders[0].teamLogo} name={catLeaders[0].team} size={14} />
                  )}
                  {catLeaders[0].team}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-black text-accent-blue">
                  {catLeaders[0].value}
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                  {stats.leaderCategories[activeLeaderCat]}
                </div>
              </div>
            </div>
          )}

          {/* Remaining leaders */}
          {catLeaders.slice(1).map((l, i) => (
            <div
              key={`${l.name}-${i}`}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover/30 ${
                i < catLeaders.length - 2 ? "border-b border-surface-border/40" : ""
              }`}
            >
              <span className={`min-w-[20px] text-center font-mono text-[11px] font-bold ${
                l.rank <= 3 ? "text-accent-amber" : "text-text-dim"
              }`}>
                {l.rank}
              </span>
              {l.headshot ? (
                <img
                  src={l.headshot}
                  alt={l.name}
                  className="h-8 w-8 rounded-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : l.teamLogo ? (
                <TeamLogo url={l.teamLogo} name={l.team} size={24} />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-text-primary">{l.name}</div>
                <div className="text-[10px] text-text-muted">{l.team}</div>
              </div>
              <span className="font-mono text-[14px] font-bold text-text-primary">
                {l.value}
              </span>
            </div>
          ))}

          {catLeaders.length === 0 && (
            <div className="py-6 text-center text-[12px] text-text-muted">
              No leader data for today&apos;s games
            </div>
          )}
        </div>
      )}

      {/* Team rankings */}
      {stats.teamForm.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
              Team Rankings
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-surface-border text-[9px] font-bold uppercase tracking-wider text-text-dim">
                  <th className="w-[32px] px-2 py-2.5 text-center">#</th>
                  <th className="min-w-[140px] px-3 py-2.5 text-left">Team</th>
                  <th className="px-2 py-2.5 text-center">Record</th>
                  <th className="px-2 py-2.5 text-center">Win%</th>
                  <th className="px-2 py-2.5 text-center">{stats.sport === "soccer" ? "GD" : "Diff"}</th>
                  {stats.teamForm[0]?.form.length > 0 && (
                    <th className="px-2 py-2.5 text-center">Form</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {stats.teamForm.map((t, i) => (
                  <tr
                    key={t.name}
                    className={`transition-colors hover:bg-surface-hover/30 ${
                      i < stats.teamForm.length - 1 ? "border-b border-surface-border/40" : ""
                    }`}
                  >
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                        t.rank <= 3 ? "text-accent-green" : "text-text-dim"
                      }`}>
                        {t.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <TeamLogo url={t.logo} name={t.name} size={18} />
                        <span className="truncate font-medium text-text-primary">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono text-text-secondary">
                      {t.record}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono font-bold text-text-primary">
                      {t.pct}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`font-mono font-semibold ${
                        t.diff > 0 ? "text-accent-green" : t.diff < 0 ? "text-accent-red" : "text-text-muted"
                      }`}>
                        {t.diff > 0 ? "+" : ""}{t.diff}
                      </span>
                    </td>
                    {t.form.length > 0 && (
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-0.5">
                          {t.form.map((f, fi) => (
                            <span
                              key={fi}
                              className={`flex h-[18px] w-[18px] items-center justify-center rounded text-[8px] font-bold ${
                                f === "W"
                                  ? "bg-accent-green/15 text-accent-green"
                                  : f === "L"
                                    ? "bg-accent-red/15 text-accent-red"
                                    : "bg-accent-amber/15 text-accent-amber"
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroCard({ label, value, accent }: { label: string; value: string; accent: "blue" | "green" | "amber" }) {
  const colors = {
    blue: "from-accent-blue/8 to-transparent border-accent-blue/15",
    green: "from-accent-green/8 to-transparent border-accent-green/15",
    amber: "from-accent-amber/8 to-transparent border-accent-amber/15",
  };
  const valueColors = {
    blue: "text-accent-blue",
    green: "text-accent-green",
    amber: "text-accent-amber",
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${colors[accent]}`}>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </div>
      <div className={`font-mono text-2xl font-black ${valueColors[accent]}`}>
        {value}
      </div>
    </div>
  );
}
