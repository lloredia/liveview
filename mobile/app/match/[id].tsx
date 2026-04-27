import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  Settings,
  Star,
  TrendingUp,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchMatch,
  fetchMatchPlayerStats,
  fetchMatchTimeline,
  listTrackedGames,
  trackGame,
  untrackGame,
  type LeaderLine,
  type LastPlay,
  type MatchDetailResponse,
  type PeriodScore,
  type Team,
  type WinProbability,
} from "@/src/api";
import { MatchDetailSkeleton } from "@/src/components/Skeleton";
import { TeamLogo } from "@/src/components/TeamLogo";
import {
  detectSport,
  finalPillSuffix,
  formatTipoffCountdown,
  LEADER_AVATAR_FALLBACK,
  normalizeLastPlay,
  normalizeLeaders,
  preGamePillText,
  TEAM_COLOR_FALLBACK,
} from "@/src/match-helpers";
import { isFinished, isLive, isScheduled } from "@/src/match-utils";
import { applyDevFixture, isFixtureEnabled } from "@/src/match-fixture";
import { ensureDeviceRegistered } from "@/src/notifications";
import { usePreferences } from "@/src/preferences-context";
import { colors, radii, spacing } from "@/src/theme";

type Tab = "recap" | "stats" | "plays";

const POLL_INTERVAL_MS = 15_000;

const T = {
  bgScreen: "#000",
  bgCard: "rgba(255,255,255,0.04)",
  bgPill: "rgba(255,255,255,0.06)",
  textPrimary: "#fff",
  textSecondary: "#ddd",
  textMutedHi: "#ccc",
  textMuted: "#888",
  textDim: "#666",
  textDisabledHi: "#555",
  textDisabledLo: "#444",
  divider: "rgba(255,255,255,0.08)",
  accentGreen: "#22c55e",
  accentPositive: "#5fd087",
  liveRed: "#f87171",
  liveRedBg: "rgba(239,68,68,0.14)",
  lastPlayBg: "rgba(0,122,51,0.1)",
  lastPlayBorder: "rgba(0,122,51,0.3)",
  lastPlayIconBg: "rgba(0,122,51,0.25)",
  barBg: "#1a1a1a",
} as const;

export default function MatchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isFavorite, toggleFavorite } = usePreferences();
  const c = colors.dark;

  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("recap");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<boolean>(false);
  const [trackBusy, setTrackBusy] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset data + skeleton whenever the route's gameId changes so we never
  // flash the previous game's content while the new one loads.
  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(true);
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Primary: match — blocks the skeleton.
    let detail: MatchDetailResponse;
    try {
      detail = applyDevFixture(await fetchMatch(id, ctrl.signal));
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError("Couldn't load this match.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setData(detail);
    setError(null);
    setLoading(false);
    setRefreshing(false);

    // Secondary fetches — best-effort, never block the screen. Skipped
    // entirely when the fixture is on so canonical demo data wins.
    if (isFixtureEnabled()) return;
    const sport = detectSport(detail.league?.short_name, detail.league?.name);
    const detailPhase = detail.match.phase ?? "scheduled";
    const liveOrDone = isLive(detailPhase) || isFinished(detailPhase);
    const liveOnly = isLive(detailPhase);

    // Leaders: basketball only, live or finished games.
    if (sport === "basketball" && liveOrDone) {
      try {
        const stats = await fetchMatchPlayerStats(id, ctrl.signal);
        if (!ctrl.signal.aborted) {
          const merged = normalizeLeaders(stats, sport);
          if (merged) {
            setData((prev) =>
              prev && prev.match.id === detail.match.id
                ? { ...prev, leaders: merged }
                : prev,
            );
          }
        }
      } catch {
        // silent — section stays hidden
      }
    }

    // Last play: live games only, every sport. Run after leaders so the
    // fresher event lands last on a slow connection.
    if (liveOnly) {
      try {
        const events = await fetchMatchTimeline(id, ctrl.signal);
        if (!ctrl.signal.aborted) {
          const lastPlay = normalizeLastPlay(
            events,
            detail.match.home_team.id,
            detail.match.away_team.id,
          );
          if (lastPlay) {
            setData((prev) =>
              prev && prev.match.id === detail.match.id
                ? { ...prev, last_play: lastPlay }
                : prev,
            );
          }
        }
      } catch {
        // silent — section stays hidden
      }
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Polling gated on (a) live status and (b) app foreground.
  // Pre-game and final games are static — polling them is waste.
  const phase = data?.match.phase ?? "scheduled";
  const live = isLive(phase);
  useEffect(() => {
    if (!live) return; // no interval for scheduled or final
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(load, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = undefined;
    };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") {
        load(); // immediate refresh on resume
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [live, load]);

  // Device + tracking state — same flow as before, no changes here.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const did = await ensureDeviceRegistered();
      if (cancelled) return;
      setDeviceId(did);
      if (!did) return;
      try {
        const tracked = await listTrackedGames(did);
        if (cancelled) return;
        setTracking(tracked.some((t) => t.game_id === id));
      } catch {
        // silent — toggle still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onToggleTrack = useCallback(async () => {
    if (!deviceId || !id || trackBusy) return;
    setTrackBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !tracking;
    setTracking(next);
    try {
      const league = data?.league?.short_name || data?.league?.name || undefined;
      if (next) await trackGame(deviceId, id, { league });
      else await untrackGame(deviceId, id);
    } catch {
      setTracking(!next);
    } finally {
      setTrackBusy(false);
    }
  }, [deviceId, id, tracking, trackBusy, data]);

  // ── Loading: skeleton in place of card, not a centered spinner ────
  if (loading && !data) {
    return (
      <View style={styles.shell}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.shellSafe}>
          <MatchDetailSkeleton scheme="dark" />
        </SafeAreaView>
      </View>
    );
  }

  // ── Inline error: error card with retry, not a full-screen takeover ──
  if (error || !data) {
    return (
      <View style={styles.shell}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.shellSafe}>
          <View style={styles.scrollContent}>
            <View style={[styles.card, { paddingBottom: 16 }]}>
              <View style={styles.topBar}>
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={6}
                  style={({ pressed }) => [styles.backChip, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <ChevronLeft size={12} color="#e8e8e8" strokeWidth={2.5} />
                  <Text style={styles.backChipLabel}>Back</Text>
                </Pressable>
                <View style={styles.iconRow} />
              </View>
              <View style={[styles.placeholderCard, { marginTop: 12 }]}>
                <Text style={styles.placeholderTitle}>
                  {error ?? "Match not found"}
                </Text>
                <Text style={styles.placeholderBody}>
                  {error
                    ? "We couldn't reach the server. Check your connection and try again."
                    : "This match isn't available right now."}
                </Text>
                <Pressable
                  onPress={() => {
                    setLoading(true);
                    setError(null);
                    load();
                  }}
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { backgroundColor: c.accentGreen, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={styles.retryBtnLabel}>Retry</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const m = data.match;
  const state = data.state;
  const finished = isFinished(phase);
  const scheduled = isScheduled(phase);

  // Score is meaningless pre-game — render "–" both sides regardless of
  // whatever 0/0 the backend may have set on the schedule row.
  const homeScore: number | null = scheduled
    ? null
    : state?.score_home ?? m.score.home ?? null;
  const awayScore: number | null = scheduled
    ? null
    : state?.score_away ?? m.score.away ?? null;

  const clock = state?.clock ?? m.clock ?? null;
  const periodRaw = state?.period ?? m.period ?? null;
  const periodLabelDisplay = formatPeriodLabel(periodRaw);
  const periodScores: PeriodScore[] = state?.period_scores ?? [];

  const homeWin = homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWin = homeScore != null && awayScore != null && awayScore > homeScore;
  const tied = homeScore != null && awayScore != null && homeScore === awayScore;

  const homeColor = m.home_team.color_primary || TEAM_COLOR_FALLBACK.home;
  const awayColor = m.away_team.color_primary || TEAM_COLOR_FALLBACK.away;
  // Leader avatar uses a darker neutral when color_primary is absent so
  // the cards read distinct from the table dots. When real brand colors
  // arrive, prefer them on the avatar too.
  const homeLeaderColor = m.home_team.color_primary || LEADER_AVATAR_FALLBACK;
  const awayLeaderColor = m.away_team.color_primary || LEADER_AVATAR_FALLBACK;

  const possessionTeam =
    !scheduled && m.possession === "home"
      ? m.home_team.name || m.home_team.short_name
      : !scheduled && m.possession === "away"
        ? m.away_team.name || m.away_team.short_name
        : null;

  // Match detail's league payload omits short_name today — pass both.
  const sport = detectSport(data.league?.short_name, data.league?.name);
  const leagueLabel = (data.league?.short_name || data.league?.name || "").toUpperCase();
  const tipoffText = scheduled ? formatTipoffCountdown(m.start_time) : null;

  const broadcastLine = buildBroadcastLine(m.venue, m.attendance, m.broadcast);

  // Win probability gating: hide on scheduled, hide on null, hide on neutral 50/50 with no delta.
  const showWinProb = (() => {
    if (scheduled) return false;
    const wp = data.win_probability;
    if (!wp) return false;
    const flat = clampPct(wp.home) === 50 && clampPct(wp.away) === 50;
    const noDelta = !wp.delta_last_play;
    if (flat && noDelta) return false;
    return true;
  })();

  // Leaders gating: at least one team's leader present, hidden on scheduled.
  const leadersHome = data.leaders?.home ?? null;
  const leadersAway = data.leaders?.away ?? null;
  const showLeaders = !scheduled && Boolean(leadersHome || leadersAway);
  const leadersLabel = finished ? "GAME LEADERS" : "LIVE LEADERS";

  // Last play: live only.
  const showLastPlay = live && Boolean(data.last_play);

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.shellSafe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={T.accentGreen}
            />
          }
        >
          <View style={styles.card}>
            {/* 1. Top nav */}
            <View style={styles.topBar}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={6}
                style={({ pressed }) => [styles.backChip, { opacity: pressed ? 0.7 : 1 }]}
              >
                <ChevronLeft size={12} color="#e8e8e8" strokeWidth={2.5} />
                <Text style={styles.backChipLabel}>Back</Text>
              </Pressable>

              <Text style={styles.leagueCaption} numberOfLines={1}>
                {leagueLabel}
              </Text>

              <View style={styles.iconRow}>
                {!finished && (
                  <Pressable
                    onPress={onToggleTrack}
                    hitSlop={6}
                    disabled={trackBusy || !deviceId}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      {
                        backgroundColor: tracking
                          ? "rgba(34,197,94,0.18)"
                          : pressed
                            ? "rgba(255,255,255,0.12)"
                            : T.bgPill,
                        opacity: !deviceId ? 0.4 : 1,
                      },
                    ]}
                  >
                    {tracking ? (
                      <Bell size={13} color={T.accentGreen} fill={T.accentGreen} strokeWidth={2} />
                    ) : (
                      <BellOff size={13} color="#ccc" strokeWidth={2} />
                    )}
                  </Pressable>
                )}
                <Pressable
                  hitSlop={6}
                  onPress={() => router.push("/(tabs)/account")}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: pressed ? "rgba(255,255,255,0.12)" : T.bgPill },
                  ]}
                >
                  <Settings size={13} color="#ccc" strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            {/* 2. Status row */}
            <StatusRow
              live={live}
              finished={finished}
              scheduled={scheduled}
              periodLabel={periodLabelDisplay}
              clock={clock}
              periodCount={periodScores.length}
              possessionTeam={possessionTeam}
              tipoffText={tipoffText}
              sport={sport}
            />

            {/* 3. Hero score */}
            <View style={styles.hero}>
              <TeamColumn
                team={m.away_team}
                fav={isFavorite(m.away_team.id)}
                onFav={() => toggleFavorite(m.away_team.id)}
                amber={c.accentAmber}
              />

              <View style={styles.heroCenter}>
                <ScoreRow
                  homeScore={homeScore}
                  awayScore={awayScore}
                  homeWin={homeWin}
                  awayWin={awayWin}
                  tied={tied}
                />
              </View>

              <TeamColumn
                team={m.home_team}
                fav={isFavorite(m.home_team.id)}
                onFav={() => toggleFavorite(m.home_team.id)}
                amber={c.accentAmber}
              />
            </View>

            {/* 4. Broadcast strip */}
            {!!broadcastLine && (
              <View style={styles.broadcastStrip}>
                <View style={styles.hairline} />
                <Text style={styles.broadcastText} numberOfLines={1} ellipsizeMode="middle">
                  {broadcastLine}
                </Text>
                <View style={styles.hairline} />
              </View>
            )}

            {/* 5. Quarter table — structural, always renders if any score data
                 plausibly exists (live/finished, or scheduled with empty cols). */}
            <PeriodTable
              periods={periodScores}
              currentPeriod={periodRaw}
              live={live}
              finished={finished}
              away={{
                short: m.away_team.short_name || m.away_team.name,
                total: awayScore,
                color: awayColor,
              }}
              home={{
                short: m.home_team.short_name || m.home_team.name,
                total: homeScore,
                color: homeColor,
              }}
            />

            {/* 6-8 Recap content */}
            {tab === "recap" && (
              <>
                {showWinProb && data.win_probability && (
                  <WinProbabilityBlock
                    wp={data.win_probability}
                    homeColor={homeColor}
                    awayColor={awayColor}
                  />
                )}
                {showLeaders && (
                  <Leaders
                    label={leadersLabel}
                    home={leadersHome}
                    away={leadersAway}
                    homeShort={m.home_team.short_name || m.home_team.name}
                    awayShort={m.away_team.short_name || m.away_team.name}
                    homeColor={homeLeaderColor}
                    awayColor={awayLeaderColor}
                  />
                )}
                {showLastPlay && data.last_play && (
                  <LastPlayCard
                    play={data.last_play}
                    homeName={m.home_team.name || m.home_team.short_name}
                    awayName={m.away_team.name || m.away_team.short_name}
                  />
                )}
              </>
            )}

            {/* 9. Tab body for stats / plays */}
            {tab !== "recap" && (
              <View style={styles.tabBody}>
                {tab === "stats" && <ComingSoon title="Team stats" body="Box-score and shot-chart land soon." />}
                {tab === "plays" && <ComingSoon title="Play-by-play" body="Live drives and key plays arrive in the next update." />}
              </View>
            )}

            <View style={styles.tabStrip}>
              {(["recap", "stats", "plays"] as Tab[]).map((t) => {
                const active = t === tab;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTab(t)}
                    style={({ pressed }) => [styles.tabCell, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: active ? T.textPrimary : "#777", fontWeight: active ? "500" : "400" },
                      ]}
                    >
                      {t === "recap" ? "Recap" : t === "stats" ? "Stats" : "Plays"}
                    </Text>
                    {active && <View style={styles.tabUnderline} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Status row ───────────────────────────────────────────────────

function StatusRow({
  live,
  finished,
  scheduled,
  periodLabel,
  clock,
  periodCount,
  possessionTeam,
  tipoffText,
  sport,
}: {
  live: boolean;
  finished: boolean;
  scheduled: boolean;
  periodLabel: string;
  clock: string | null;
  periodCount: number;
  possessionTeam: string | null;
  tipoffText: string | null;
  sport: ReturnType<typeof detectSport>;
}) {
  if (live) {
    return (
      <View style={styles.statusRow}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        {(periodLabel || clock) && (
          <Text style={styles.statusInline}>
            {[periodLabel, clock].filter(Boolean).join(" · ")}
          </Text>
        )}
        {!!possessionTeam && (
          <>
            <Text style={styles.statusSep}>·</Text>
            <Text style={styles.possessionText}>{possessionTeam} ball</Text>
          </>
        )}
      </View>
    );
  }
  if (finished) {
    return (
      <View style={styles.statusRow}>
        <View style={styles.neutralPill}>
          <Text style={styles.neutralPillText}>
            {`FINAL${finalPillSuffix(periodCount)}`}
          </Text>
        </View>
      </View>
    );
  }
  if (scheduled) {
    return (
      <View style={styles.statusRow}>
        <View style={styles.neutralPill}>
          <Text style={styles.neutralPillText}>{preGamePillText(sport)}</Text>
        </View>
        {!!tipoffText && <Text style={styles.statusInline}>{tipoffText}</Text>}
      </View>
    );
  }
  return null;
}

// ── Score row ────────────────────────────────────────────────────

function ScoreRow({
  homeScore,
  awayScore,
  homeWin,
  awayWin,
  tied,
}: {
  homeScore: number | null;
  awayScore: number | null;
  homeWin: boolean;
  awayWin: boolean;
  tied: boolean;
}) {
  if (homeScore === null && awayScore === null) {
    return (
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNum, { color: T.textDim }]}>–</Text>
        <Text style={styles.scoreSep}>—</Text>
        <Text style={[styles.scoreNum, { color: T.textDim }]}>–</Text>
      </View>
    );
  }
  const awayBright = tied || awayWin;
  const homeBright = tied || homeWin;
  return (
    <View style={styles.scoreRow}>
      <Text style={[styles.scoreNum, { color: awayBright ? T.textPrimary : T.textMuted }]}>
        {awayScore ?? "–"}
      </Text>
      <Text style={styles.scoreSep}>—</Text>
      <Text style={[styles.scoreNum, { color: homeBright ? T.textPrimary : T.textMuted }]}>
        {homeScore ?? "–"}
      </Text>
    </View>
  );
}

// ── Hero team column ─────────────────────────────────────────────

function TeamColumn({
  team,
  fav,
  onFav,
  amber,
}: {
  team: Team;
  fav: boolean;
  onFav: () => void;
  amber: string;
}) {
  const recordLine = [team.record, team.standing].filter(Boolean).join(" · ");
  return (
    <View style={styles.heroSide}>
      <Pressable onPress={onFav} hitSlop={6} style={styles.logoPress}>
        <TeamLogo
          url={team.logo_url}
          name={team.short_name || team.name}
          size={52}
        />
        {fav && (
          <View style={[styles.favBadge, { backgroundColor: amber }]}>
            <Star size={9} color="#000" fill="#000" strokeWidth={2} />
          </View>
        )}
      </Pressable>
      <View style={{ alignItems: "center" }}>
        <Text style={styles.teamName} numberOfLines={1}>
          {team.short_name || team.name}
        </Text>
        {!!recordLine && (
          <Text style={styles.teamRecord} numberOfLines={1}>
            {recordLine}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Period table ─────────────────────────────────────────────────

interface TeamSlot {
  short: string;
  total: number | null;
  color: string;
}

function PeriodTable({
  periods,
  currentPeriod,
  live,
  finished,
  home,
  away,
}: {
  periods: PeriodScore[];
  currentPeriod: string | null;
  live: boolean;
  finished: boolean;
  home: TeamSlot;
  away: TeamSlot;
}) {
  const columnCount = Math.max(4, periods.length);
  const cols = Array.from({ length: columnCount }, (_, i) => {
    const score = periods[i];
    return {
      label: defaultPeriodLabel(i, columnCount, score?.period),
      home: score?.home,
      away: score?.away,
    };
  });

  // Active-period highlight only when live. Final games have no current quarter.
  const currentDigit = currentPeriod
    ? parseInt(currentPeriod.match(/\d+/)?.[0] ?? "0", 10)
    : 0;
  const currentIdx = live && currentDigit > 0 ? currentDigit - 1 : -1;

  // For finished games, the highest period in the data is the "last" period —
  // but we don't highlight it red (no current period). Headers stay neutral.
  void finished;

  return (
    <View style={styles.tableCard}>
      {/* Header row */}
      <View style={styles.tableRow}>
        <View style={styles.tableTeamCell} />
        {cols.map((col, i) => (
          <Text
            key={`h-${i}`}
            style={[
              styles.tableHeaderLabel,
              {
                color:
                  i === currentIdx
                    ? T.liveRed
                    : i < currentIdx
                      ? T.textDim
                      : T.textDisabledHi,
              },
            ]}
          >
            {col.label}
          </Text>
        ))}
        <Text style={[styles.tableHeaderLabel, { color: "#aaa" }]}>TOT</Text>
      </View>

      {/* Away row first */}
      <View style={[styles.tableRow, { paddingVertical: 6 }]}>
        <View style={styles.tableTeamCell}>
          <View style={[styles.teamDot, { backgroundColor: away.color }]} />
          <Text style={styles.tableTeamLabel}>{away.short}</Text>
        </View>
        {cols.map((col, i) => (
          <Text
            key={`away-${i}`}
            style={[
              styles.tableScore,
              { color: col.away === undefined ? T.textDisabledLo : T.textMutedHi },
            ]}
          >
            {col.away !== undefined ? col.away : "–"}
          </Text>
        ))}
        <Text
          style={[
            styles.tableScore,
            { color: away.total === null ? T.textDisabledLo : T.textPrimary, fontWeight: "500" },
          ]}
        >
          {away.total === null ? "–" : away.total}
        </Text>
      </View>

      {/* Home row */}
      <View style={[styles.tableRow, { paddingVertical: 6 }]}>
        <View style={styles.tableTeamCell}>
          <View style={[styles.teamDot, { backgroundColor: home.color }]} />
          <Text style={styles.tableTeamLabel}>{home.short}</Text>
        </View>
        {cols.map((col, i) => (
          <Text
            key={`home-${i}`}
            style={[
              styles.tableScore,
              { color: col.home === undefined ? T.textDisabledLo : T.textMutedHi },
            ]}
          >
            {col.home !== undefined ? col.home : "–"}
          </Text>
        ))}
        <Text
          style={[
            styles.tableScore,
            { color: home.total === null ? T.textDisabledLo : T.textPrimary, fontWeight: "500" },
          ]}
        >
          {home.total === null ? "–" : home.total}
        </Text>
      </View>
    </View>
  );
}

// ── Win probability ──────────────────────────────────────────────

function WinProbabilityBlock({
  wp,
  homeColor,
  awayColor,
}: {
  wp: WinProbability;
  homeColor: string;
  awayColor: string;
}) {
  const homePct = clampPct(wp.home);
  const awayPct = clampPct(wp.away);
  const homeLeads = homePct >= awayPct;
  const delta = wp.delta_last_play ?? 0;

  return (
    <View style={styles.winProbWrap}>
      <View style={styles.winProbHeader}>
        <Text style={styles.sectionLabel}>WIN PROBABILITY · LIVE</Text>
        {delta !== 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <TrendingUp size={11} color={T.accentPositive} strokeWidth={2.4} />
            <Text style={styles.deltaText}>
              {delta > 0 ? `+${delta}% last play` : `${delta}% last play`}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.winProbBarRow}>
        <Text
          style={[
            styles.winProbPct,
            {
              color: !homeLeads ? T.textPrimary : "#aaa",
              fontWeight: !homeLeads ? "500" : "400",
              textAlign: "left",
            },
          ]}
        >
          {awayPct}%
        </Text>
        <View style={styles.winProbBar}>
          <View style={{ width: `${awayPct}%`, backgroundColor: awayColor, height: "100%" }} />
          <View style={{ flex: 1, backgroundColor: homeColor, height: "100%" }} />
        </View>
        <Text
          style={[
            styles.winProbPct,
            {
              color: homeLeads ? T.textPrimary : "#aaa",
              fontWeight: homeLeads ? "500" : "400",
              textAlign: "right",
            },
          ]}
        >
          {homePct}%
        </Text>
      </View>
    </View>
  );
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ── Live / Game leaders ──────────────────────────────────────────

function Leaders({
  label,
  home,
  away,
  homeShort,
  awayShort,
  homeColor,
  awayColor,
}: {
  label: string;
  home: LeaderLine | null;
  away: LeaderLine | null;
  homeShort: string;
  awayShort: string;
  homeColor: string;
  awayColor: string;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>{label}</Text>
      <View style={{ gap: 6 }}>
        {home && <LeaderRow leader={home} teamShort={homeShort} accent={homeColor} />}
        {away && <LeaderRow leader={away} teamShort={awayShort} accent={awayColor} />}
      </View>
    </View>
  );
}

function LeaderRow({
  leader,
  teamShort,
  accent,
}: {
  leader: LeaderLine;
  teamShort: string;
  accent: string;
}) {
  return (
    <View style={styles.leaderRow}>
      <View style={[styles.leaderAvatar, { backgroundColor: accent }]}>
        <Text style={styles.leaderInitials}>{leader.initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.leaderName} numberOfLines={1}>
          {leader.name}
        </Text>
        <Text style={styles.leaderMeta} numberOfLines={1}>
          {`${teamShort} · ${leader.position} #${leader.jersey}`}
        </Text>
      </View>
      <View style={styles.leaderStats}>
        <Stat label="PTS" value={leader.pts} />
        <Stat label="REB" value={leader.reb} />
        <Stat label="AST" value={leader.ast} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Last play ────────────────────────────────────────────────────

function LastPlayCard({
  play,
  homeName,
  awayName,
}: {
  play: LastPlay;
  homeName: string;
  awayName: string;
}) {
  const fullName = play.team === "home" ? homeName : awayName;
  const city = (fullName || "").trim().split(/\s+/)[0] || fullName;
  const ago = formatSecondsAgo(play.seconds_ago);
  const meta = [city, ago, play.distance_ft ? `${play.distance_ft} ft` : null]
    .filter(Boolean)
    .join(" · ");
  const points = play.points > 0 ? `+${play.points}` : `${play.points}`;
  return (
    <View style={styles.lastPlayCard}>
      <View style={styles.lastPlayIcon}>
        <Check size={12} color={T.accentPositive} strokeWidth={2.5} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lastPlayHeadline} numberOfLines={1}>
          {play.text}
        </Text>
        <Text style={styles.lastPlayMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.lastPlayPoints}>{points}</Text>
    </View>
  );
}

function formatSecondsAgo(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  const mins = Math.floor(sec / 60);
  return `${mins}m ago`;
}

// ── Helpers ──────────────────────────────────────────────────────

function defaultPeriodLabel(idx: number, count: number, raw?: string): string {
  if (raw && /^\d/.test(raw)) return raw.toUpperCase();
  if (count <= 2) return `${idx + 1}H`;
  if (count <= 4) return `${idx + 1}Q`;
  if (count <= 9) return `${idx + 1}I`;
  return `${idx + 1}P`;
}

function formatPeriodLabel(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z]\d/.test(trimmed)) return trimmed.toUpperCase();
  const m = trimmed.match(/^(\d+)\s*([A-Za-z]+)?/);
  if (m) {
    const n = m[1];
    const suffix = (m[2] ?? "Q").toUpperCase();
    const prefix = suffix.startsWith("H") ? "H" : suffix.startsWith("P") ? "P" : "Q";
    return `${prefix}${n}`;
  }
  return trimmed.toUpperCase();
}

function buildBroadcastLine(
  venue: string | null | undefined,
  attendance: number | null | undefined,
  broadcast: string | null | undefined,
): string {
  const parts: string[] = [];
  if (venue) parts.push(venue.toUpperCase());
  if (typeof attendance === "number" && attendance > 0) parts.push(attendance.toLocaleString());
  if (broadcast) parts.push(broadcast.toUpperCase());
  return parts.join(" · ");
}

function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: T.bgScreen },
  shellSafe: { flex: 1, backgroundColor: T.bgScreen },
  scrollContent: { padding: 12, paddingBottom: spacing.xl },

  card: {
    backgroundColor: T.bgScreen,
    borderColor: T.divider,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 16,
    overflow: "hidden",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 6,
    backgroundColor: T.bgPill,
    borderRadius: 999,
  },
  backChipLabel: { color: "#e8e8e8", fontSize: 12 },
  leagueCaption: {
    fontSize: 11,
    color: T.textDim,
    fontWeight: "500",
    letterSpacing: 0.8,
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  iconRow: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  statusRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: T.liveRedBg,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.liveRed },
  liveText: { color: T.liveRed, fontSize: 11, fontWeight: "500", letterSpacing: 0.8 },
  neutralPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: T.bgPill,
  },
  neutralPillText: {
    color: T.textMuted,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  statusInline: { color: T.textPrimary, fontSize: 12, fontWeight: "500" },
  statusSep: { color: T.textDisabledLo, fontSize: 12 },
  possessionText: { color: T.textMuted, fontSize: 12 },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  heroSide: { flex: 1, alignItems: "center", gap: 8 },
  heroCenter: { alignItems: "center", justifyContent: "center" },
  teamName: { color: T.textPrimary, fontSize: 13, fontWeight: "500" },
  teamRecord: { color: "#777", fontSize: 10, marginTop: 2 },
  logoPress: { position: "relative" },
  favBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  scoreNum: {
    fontSize: 38,
    fontWeight: "500",
    lineHeight: 38,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  scoreSep: { color: T.textDisabledLo, fontSize: 22, lineHeight: 22 },

  broadcastStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 14,
  },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.divider },
  broadcastText: {
    color: T.textDim,
    fontSize: 10,
    letterSpacing: 0.6,
    flexShrink: 1,
  },

  tableCard: {
    backgroundColor: T.bgCard,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tableTeamCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  tableHeaderLabel: {
    width: 26,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
  },
  tableTeamLabel: { color: T.textSecondary, fontSize: 12 },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  tableScore: { width: 26, textAlign: "center", fontSize: 13 },

  sectionWrap: { marginBottom: 12 },
  sectionLabel: {
    color: T.textDim,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
  },

  winProbWrap: { marginBottom: 14 },
  winProbHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  deltaText: { color: T.accentPositive, fontSize: 10 },
  winProbBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  winProbPct: { fontSize: 11, minWidth: 30 },
  winProbBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.barBg,
    flexDirection: "row",
    overflow: "hidden",
  },

  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.bgCard,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  leaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderInitials: { color: "#fff", fontSize: 11, fontWeight: "500" },
  leaderName: { color: T.textPrimary, fontSize: 13, fontWeight: "500" },
  leaderMeta: { color: "#777", fontSize: 10 },
  leaderStats: { flexDirection: "row", gap: 12 },
  statValue: { color: T.textPrimary, fontSize: 13, fontWeight: "500", lineHeight: 16 },
  statLabel: { color: T.textDim, fontSize: 9, letterSpacing: 0.5 },

  lastPlayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: T.lastPlayBg,
    borderColor: T.lastPlayBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 14,
  },
  lastPlayIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.lastPlayIconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  lastPlayHeadline: { color: T.textPrimary, fontSize: 12, fontWeight: "500" },
  lastPlayMeta: { color: T.textMuted, fontSize: 10, marginTop: 1 },
  lastPlayPoints: { color: T.accentPositive, fontSize: 14, fontWeight: "500" },

  tabBody: { paddingTop: 4, paddingBottom: 4 },
  placeholderCard: {
    backgroundColor: T.bgCard,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  placeholderTitle: { color: T.textPrimary, fontSize: 14, fontWeight: "500", marginBottom: 4 },
  placeholderBody: { color: T.textMuted, fontSize: 12, lineHeight: 18 },
  retryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
  },
  retryBtnLabel: { color: "#000", fontSize: 13, fontWeight: "700" },

  tabStrip: {
    flexDirection: "row",
    borderTopColor: T.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -14,
  },
  tabCell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 10,
    position: "relative",
  },
  tabLabel: { fontSize: 13 },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 24,
    right: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: T.accentGreen,
  },
});
