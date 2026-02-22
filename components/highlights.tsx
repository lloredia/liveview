"use client";

import { useEffect, useState } from "react";

interface HighlightsProps {
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  matchPhase: string;
}

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  url: string;
}

const LEAGUE_ESPN: Record<string, { sport: string; slug: string }> = {
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NFL: { sport: "football", slug: "nfl" },
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

function fmtDur(sec: number): string {
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function ytSearch(h: string, a: string, l: string): string {
  return (
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(h + " vs " + a + " " + l + " highlights")
  );
}

/** Extract YouTube video ID for embedding (watch, youtu.be, embed). */
function youtubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return parts[1];
      return null;
    }
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
  } catch {
    // not a valid URL
  }
  return null;
}

export function Highlights({
  homeTeamName,
  awayTeamName,
  leagueName,
  matchPhase,
}: HighlightsProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recapUrl, setRecapUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const finished = matchPhase === "finished";

  useEffect(() => {
    if (!finished || !homeTeamName || !awayTeamName) return;
    const info = LEAGUE_ESPN[leagueName];
    if (!info) return;

    setLoading(true);

    (async () => {
      try {
        const { sport, slug } = info;
        const prefix =
          sport === "soccer"
            ? "soccer/" + slug
            : sport + "/" + slug;

        const sbUrl =
          "https://site.api.espn.com/apis/site/v2/sports/" +
          prefix +
          "/scoreboard";

        const sbRes = await fetch(sbUrl);
        if (!sbRes.ok) {
          setLoading(false);
          return;
        }

        const sbData = await sbRes.json();
        const events: any[] = sbData.events || [];
        const hn = homeTeamName.toLowerCase();
        const an = awayTeamName.toLowerCase();

        let evt: any = null;
        for (const e of events) {
          const comps = e.competitions?.[0]?.competitors || [];
          const dn = comps.map(
            (c: any) => (c.team?.displayName || "").toLowerCase()
          );
          const sn = comps.map(
            (c: any) => (c.team?.shortDisplayName || "").toLowerCase()
          );
          const all = [...dn, ...sn];
          if (
            all.some((n: string) => n.includes(hn) || hn.includes(n)) &&
            all.some((n: string) => n.includes(an) || an.includes(n))
          ) {
            evt = e;
            break;
          }
        }

        if (!evt) {
          setLoading(false);
          return;
        }

        if (sport === "soccer") {
          setRecapUrl(
            "https://www.espn.com/soccer/recap/_/gameId/" + evt.id
          );
        } else {
          setRecapUrl(
            "https://www.espn.com/" + sport + "/recap?gameId=" + evt.id
          );
        }

        const sumUrl =
          "https://site.api.espn.com/apis/site/v2/sports/" +
          prefix +
          "/summary?event=" +
          evt.id;

        const sumRes = await fetch(sumUrl);
        if (!sumRes.ok) {
          setLoading(false);
          return;
        }

        const sum = await sumRes.json();
        const found: VideoItem[] = [];
        const allVids: any[] = [
          ...(sum.videos || []),
          ...(sum.highlights || []),
        ];
        const articles: any[] = sum.news?.articles || [];
        for (const ar of articles) {
          if (ar.videos) allVids.push(...ar.videos);
        }

        for (const v of allVids) {
          if (!v) continue;
          const t = v.headline || v.title || v.description || "";
          if (!t) continue;
          found.push({
            id: v.id || String(found.length),
            title: t,
            thumbnail:
              v.thumbnail ||
              v.images?.[0]?.url ||
              v.posterImages?.default?.href ||
              "",
            duration: v.duration ? fmtDur(v.duration) : "",
            url:
              v.links?.web?.href ||
              v.links?.mobile?.href ||
              v.link ||
              ytSearch(homeTeamName, awayTeamName, leagueName),
          });
        }

        for (const ar of articles) {
          const isRecap =
            ar.type === "Recap" ||
            (ar.headline || "").toLowerCase().includes("recap");
          if (isRecap && ar.links?.web?.href) {
            if (!found.some((f) => f.url === ar.links.web.href)) {
              found.push({
                id: "recap-" + (ar.id || "0"),
                title: ar.headline || "Game Recap",
                thumbnail: ar.images?.[0]?.url || "",
                duration: "",
                url: ar.links.web.href,
              });
            }
          }
        }

        setVideos(found.slice(0, 6));
      } catch {
        // optional feature
      }
      setLoading(false);
    })();
  }, [finished, homeTeamName, awayTeamName, leagueName]);

  if (!finished) return null;

  const ytUrl = ytSearch(homeTeamName, awayTeamName, leagueName);
  const firstYoutubeVideo = videos.find((v) => youtubeVideoId(v.url));
  const embedId = firstYoutubeVideo ? youtubeVideoId(firstYoutubeVideo.url) : null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3 transition-colors hover:bg-surface-hover"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🎬</span>
          <span className="text-[12px] font-bold uppercase tracking-wider text-text-tertiary">
            Highlights &amp; Recap
          </span>
          {(videos.length > 0 || loading) && (
            <span className="rounded-full bg-accent-green/10 px-1.5 py-0.5 text-[9px] font-bold text-accent-green">
              {videos.length > 0 ? videos.length : "…"}
            </span>
          )}
        </div>
        <span
          className={
            "text-[11px] text-text-muted transition-transform " +
            (expanded ? "rotate-180" : "")
          }
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div className="animate-fade-in">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
            </div>
          ) : (
            <div>
              {/* Embedded video: first YouTube from API, or fallback embed for official/match glance */}
              <div className="mb-4 overflow-hidden rounded-xl border border-surface-border bg-black">
                {embedId ? (
                  <div className="relative aspect-video w-full">
                    <iframe
                      title="Match highlights"
                      src={`https://www.youtube.com/embed/${embedId}?rel=0`}
                      className="absolute inset-0 h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={ytUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative flex aspect-video w-full items-center justify-center bg-surface-card"
                  >
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-surface-hover/50 to-surface-card">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-red shadow-lg ring-4 ring-white/20">
                        <span className="ml-1 text-3xl text-white">▶</span>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                      <p className="text-[13px] font-semibold text-white">
                        {homeTeamName} vs {awayTeamName}
                      </p>
                      <p className="text-[11px] text-white/90">Watch highlights & recap on YouTube</p>
                    </div>
                  </a>
                )}
                {firstYoutubeVideo && (
                  <div className="border-t border-surface-border bg-surface-card px-3 py-2">
                    <p className="line-clamp-1 text-[11px] font-medium text-text-secondary">
                      {firstYoutubeVideo.title}
                    </p>
                  </div>
                )}
              </div>

              {videos.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {videos.map((vid) => (
                    <a
                      key={vid.id}
                      href={vid.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/vid overflow-hidden rounded-xl border border-surface-border bg-surface-card transition-all hover:-translate-y-0.5 hover:border-surface-border-light hover:shadow-lg"
                    >
                      <div className="relative aspect-video bg-surface">
                        {vid.thumbnail ? (
                          <img
                            src={vid.thumbnail}
                            alt={vid.title}
                            className="h-full w-full object-cover transition-transform group-hover/vid:scale-105"
                            onError={(e) => {
                              (
                                e.target as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-3xl text-text-dim">
                            🎥
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/vid:opacity-100">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                            <span className="ml-1 text-xl text-black">
                              ▶
                            </span>
                          </div>
                        </div>
                        {vid.duration && (
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            {vid.duration}
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="line-clamp-2 text-[12px] font-medium text-text-secondary group-hover/vid:text-text-primary">
                          {vid.title}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {recapUrl && (
                  <a
                    href={recapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-surface-border-light hover:text-text-primary"
                  >
                    📰 ESPN Recap ↗
                  </a>
                )}
                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-surface-border-light hover:text-text-primary"
                >
                  ▶️ Search YouTube ↗
                </a>
              </div>

              {videos.length === 0 && !embedId && (
                <div className="mt-2 text-[11px] text-text-muted">
                  Use the links above to watch highlights.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
