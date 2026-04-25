import { Link } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchToday,
  type LeagueGroup,
  type MatchSummary,
  type TodayResponse,
} from "@/src/api";
import {
  isFinished,
  isLive,
  isScheduled,
  phaseShortLabel,
  sportEmoji,
} from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";

interface Row {
  type: "league-header" | "match";
  key: string;
  league?: LeagueGroup;
  match?: MatchSummary;
}

function buildRows(today: TodayResponse | null): Row[] {
  if (!today) return [];
  const rows: Row[] = [];
  for (const lg of today.leagues) {
    if (!lg.matches.length) continue;
    rows.push({ type: "league-header", key: `lg-${lg.league_id}`, league: lg });
    for (const m of lg.matches) {
      rows.push({ type: "match", key: m.id, match: m, league: lg });
    }
  }
  return rows;
}

export default function ScoreboardScreen() {
  // Force dark for premium scoreboard look — light mode option lives in Account
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];
  const isDark = scheme === "dark";

  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetchToday(ctrl.signal);
      setData(res);
      setError(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError("Couldn't load scores. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [load]);

  const rows = buildRows(data);
  const liveCount = data?.live ?? 0;
  const totalCount = data?.total_matches ?? 0;

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === "league-header" && item.league) {
      return <LeagueHeader league={item.league} c={c} />;
    }
    if (item.type === "match" && item.match) {
      return <MatchRow match={item.match} c={c} />;
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.surface }}>
        {/* Hero header */}
        <View style={styles.heroHeader}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
            <Text style={[text.headingLg, { color: c.textPrimary, letterSpacing: -0.5 }]}>
              LIVE
              <Text style={{ color: c.accentGreen }}>VIEW</Text>
            </Text>
            {liveCount > 0 && (
              <View style={[styles.livePill, { backgroundColor: c.accentRed + "22" }]}>
                <View style={[styles.liveDot, { backgroundColor: c.accentRed }]} />
                <Text style={[text.labelSm, { color: c.accentRed, fontWeight: "800" }]}>
                  {liveCount} LIVE
                </Text>
              </View>
            )}
          </View>
          <Text style={[text.labelMd, { color: c.textMuted, marginTop: 2 }]}>
            {totalCount > 0
              ? `${totalCount} matches today`
              : "Today"}
          </Text>
        </View>
      </SafeAreaView>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accentGreen} />
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => {
              setLoading(true);
              load();
            }}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: c.accentGreen, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[text.bodyMd, { color: "#000", fontWeight: "700" }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={c.accentGreen}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
                No matches today.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function LeagueHeader({ league: lg, c }: { league: LeagueGroup; c: typeof colors.dark }) {
  return (
    <View
      style={[
        styles.leagueHeader,
        { backgroundColor: c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      <Text style={{ fontSize: 14 }}>{sportEmoji(lg.sport)}</Text>
      <Text
        style={[
          text.labelMd,
          {
            color: c.textPrimary,
            fontWeight: "800",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          },
        ]}
      >
        {lg.league_short_name || lg.league_name}
      </Text>
      {lg.league_country && (
        <Text style={[text.labelSm, { color: c.textDim }]}>{lg.league_country}</Text>
      )}
      <View style={{ flex: 1 }} />
      <Text style={[text.labelSm, { color: c.textMuted }]}>{lg.matches.length}</Text>
    </View>
  );
}

function MatchRow({ match: m, c }: { match: MatchSummary; c: typeof colors.dark }) {
  const live = isLive(m.phase);
  const finished = isFinished(m.phase);
  const scheduled = isScheduled(m.phase);
  const homeWin = finished && m.score.home > m.score.away;
  const awayWin = finished && m.score.away > m.score.home;
  const start = m.start_time
    ? new Date(m.start_time).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <Link href={{ pathname: "/match/[id]", params: { id: m.id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.matchRow,
          {
            backgroundColor: pressed ? c.surfaceHover : c.surface,
            borderBottomColor: c.surfaceBorder,
          },
        ]}
      >
        {/* Status column */}
        <View style={styles.statusCol}>
          {live ? (
            <View style={styles.liveStatus}>
              <View style={[styles.liveDotSm, { backgroundColor: c.accentRed }]} />
              <Text
                style={[
                  text.labelXs,
                  { color: c.accentRed, fontWeight: "800", letterSpacing: 0.5 },
                ]}
              >
                {phaseShortLabel(m.phase, m.clock) || "LIVE"}
              </Text>
            </View>
          ) : finished ? (
            <Text
              style={[
                text.labelXs,
                {
                  color: c.textMuted,
                  fontWeight: "800",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                },
              ]}
            >
              FT
            </Text>
          ) : scheduled ? (
            <Text style={[text.labelMd, { color: c.textSecondary, fontWeight: "600" }]}>
              {start}
            </Text>
          ) : (
            <Text style={[text.labelXs, { color: c.textMuted, fontWeight: "800" }]}>
              {phaseShortLabel(m.phase, m.clock).slice(0, 4)}
            </Text>
          )}
          {live && m.period && (
            <Text style={[text.labelXs, { color: c.textDim, marginTop: 2 }]}>
              {m.period}
            </Text>
          )}
        </View>

        {/* Teams + scores */}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.teamLine}>
            <Text
              numberOfLines={1}
              style={[
                text.bodyMd,
                {
                  flex: 1,
                  color: scheduled ? c.textSecondary : homeWin || live ? c.textPrimary : c.textSecondary,
                  fontWeight: homeWin ? "800" : "600",
                },
              ]}
            >
              {m.home_team.short_name || m.home_team.name}
            </Text>
            {!scheduled && (
              <Text
                style={[
                  text.scoreMd,
                  {
                    color: homeWin || live ? c.textPrimary : c.textSecondary,
                    fontVariant: ["tabular-nums"],
                  },
                ]}
              >
                {m.score.home}
              </Text>
            )}
          </View>
          <View style={styles.teamLine}>
            <Text
              numberOfLines={1}
              style={[
                text.bodyMd,
                {
                  flex: 1,
                  color: scheduled ? c.textSecondary : awayWin || live ? c.textPrimary : c.textSecondary,
                  fontWeight: awayWin ? "800" : "600",
                },
              ]}
            >
              {m.away_team.short_name || m.away_team.name}
            </Text>
            {!scheduled && (
              <Text
                style={[
                  text.scoreMd,
                  {
                    color: awayWin || live ? c.textPrimary : c.textSecondary,
                    fontVariant: ["tabular-nums"],
                  },
                ]}
              >
                {m.score.away}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveDotSm: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
    minHeight: 64,
  },
  statusCol: {
    width: 56,
    alignItems: "flex-start",
  },
  liveStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  teamLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
});
