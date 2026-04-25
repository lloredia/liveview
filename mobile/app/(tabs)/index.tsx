import { Link } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchToday, type LeagueGroup, type MatchSummary, type TodayResponse } from "@/src/api";
import { isFinished, isLive, isScheduled, phaseShortLabel, sportEmoji } from "@/src/match-utils";
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
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];

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

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === "league-header" && item.league) {
      const lg = item.league;
      return (
        <View
          style={[
            styles.leagueHeader,
            { backgroundColor: c.surface, borderBottomColor: c.surfaceBorder },
          ]}
        >
          <Text style={{ fontSize: 16 }}>{sportEmoji(lg.sport)}</Text>
          <Text style={[text.labelLg, { color: c.textPrimary, fontWeight: "800" }]}>
            {lg.league_short_name || lg.league_name}
          </Text>
          {lg.league_country && (
            <Text style={[text.labelMd, { color: c.textMuted }]}>
              {lg.league_country}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={[text.labelMd, { color: c.textMuted }]}>
            {lg.matches.length}
          </Text>
        </View>
      );
    }

    if (item.type === "match" && item.match && item.league) {
      const m = item.match;
      const live = isLive(m.phase);
      const finished = isFinished(m.phase);
      const scheduled = isScheduled(m.phase);
      const start = m.start_time
        ? new Date(m.start_time).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
      const statusLabel = live
        ? phaseShortLabel(m.phase, m.clock)
        : finished
          ? "FT"
          : scheduled
            ? start
            : phaseShortLabel(m.phase, m.clock);
      return (
        <Link
          href={{ pathname: "/match/[id]", params: { id: m.id } }}
          asChild
        >
          <Pressable
            style={({ pressed }) => [
              styles.matchRow,
              {
                backgroundColor: pressed ? c.surfaceHover : c.surface,
                borderBottomColor: c.surfaceBorder,
              },
            ]}
          >
            <View style={styles.statusCol}>
              <Text
                style={[
                  text.labelMd,
                  {
                    color: live ? c.accentRed : finished ? c.textMuted : c.textSecondary,
                    fontWeight: "700",
                  },
                ]}
              >
                {statusLabel || "—"}
              </Text>
              {live && m.period && (
                <Text style={[text.labelXs, { color: c.textMuted, marginTop: 2 }]}>
                  {m.period}
                </Text>
              )}
            </View>

            <View style={styles.teamCol}>
              <Text
                numberOfLines={1}
                style={[
                  text.bodySm,
                  {
                    color: c.textPrimary,
                    fontWeight:
                      finished && m.score.home > m.score.away ? "800" : "600",
                  },
                ]}
              >
                {m.home_team.short_name || m.home_team.name}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  text.bodySm,
                  {
                    color: c.textPrimary,
                    marginTop: 2,
                    fontWeight:
                      finished && m.score.away > m.score.home ? "800" : "600",
                  },
                ]}
              >
                {m.away_team.short_name || m.away_team.name}
              </Text>
            </View>

            <View style={styles.scoreCol}>
              {scheduled ? (
                <Text style={[text.bodySm, { color: c.textMuted }]}>vs</Text>
              ) : (
                <>
                  <Text
                    style={[
                      text.scoreMd,
                      {
                        color:
                          live || (finished && m.score.home > m.score.away)
                            ? c.textPrimary
                            : c.textSecondary,
                      },
                    ]}
                  >
                    {m.score.home}
                  </Text>
                  <Text
                    style={[
                      text.scoreMd,
                      {
                        color:
                          live || (finished && m.score.away > m.score.home)
                            ? c.textPrimary
                            : c.textSecondary,
                      },
                    ]}
                  >
                    {m.score.away}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
        </Link>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={[styles.header, { borderBottomColor: c.surfaceBorder }]}>
        <Text style={[text.headingMd, { color: c.textPrimary }]}>
          LIVE
          <Text style={{ color: c.accentGreen }}>VIEW</Text>
        </Text>
        {data && (
          <Text style={[text.labelMd, { color: c.textMuted }]}>
            {data.live > 0 ? `${data.live} live · ` : ""}
            {data.total_matches} today
          </Text>
        )}
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  statusCol: {
    width: 56,
    alignItems: "flex-start",
  },
  teamCol: {
    flex: 1,
    minWidth: 0,
  },
  scoreCol: {
    width: 36,
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 44,
  },
});
