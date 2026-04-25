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
import { isFinished, isLive, isScheduled, phaseShortLabel } from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";
import { TeamLogo } from "@/src/components/TeamLogo";
import { SportIcon } from "@/src/components/SportIcon";

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
  const [day, setDay] = useState<"yesterday" | "today" | "upcoming">("today");
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
        <DayStrip active={day} onSelect={setDay} c={c} />
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
      {lg.league_logo_url ? (
        <TeamLogo url={lg.league_logo_url} name={lg.league_short_name || lg.league_name} size={22} />
      ) : (
        <View
          style={[
            styles.sportIconWrap,
            { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder },
          ]}
        >
          <SportIcon sport={lg.sport} size={12} color={c.textTertiary} />
        </View>
      )}
      <Text
        style={[
          text.labelMd,
          {
            color: c.textPrimary,
            fontWeight: "800",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginLeft: spacing.sm,
          },
        ]}
      >
        {lg.league_short_name || lg.league_name}
      </Text>
      {lg.league_country && (
        <Text
          style={[
            text.labelSm,
            { color: c.textDim, marginLeft: spacing.sm, textTransform: "uppercase" },
          ]}
        >
          {lg.league_country}
        </Text>
      )}
      <View style={{ flex: 1 }} />
      <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700" }]}>
        {lg.matches.length}
      </Text>
    </View>
  );
}

function MatchRow({ match: m, c }: { match: MatchSummary; c: typeof colors.dark }) {
  const live = isLive(m.phase);
  const finished = isFinished(m.phase);
  const scheduled = isScheduled(m.phase);
  const homeWin = finished && m.score.home > m.score.away;
  const awayWin = finished && m.score.away > m.score.home;
  const homeLost = finished && m.score.away > m.score.home;
  const awayLost = finished && m.score.home > m.score.away;
  const start = m.start_time
    ? new Date(m.start_time).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  // Center pillar: status pill + (live ? clock : nothing)
  const renderCenter = () => {
    if (live) {
      return (
        <View style={{ alignItems: "center" }}>
          <View style={styles.liveRow}>
            <View style={[styles.liveDotSm, { backgroundColor: c.accentRed }]} />
            <Text
              style={[
                text.labelMd,
                {
                  color: c.accentRed,
                  fontWeight: "900",
                  letterSpacing: 0.4,
                },
              ]}
            >
              LIVE
            </Text>
          </View>
          {m.clock && (
            <Text style={[text.labelMd, { color: c.textPrimary, marginTop: 2 }]}>
              {m.clock}
            </Text>
          )}
          {m.period && (
            <Text style={[text.labelXs, { color: c.textMuted, marginTop: 2 }]}>
              {m.period}
            </Text>
          )}
        </View>
      );
    }
    if (finished) {
      return (
        <Text
          style={[
            text.bodyMd,
            { color: c.textPrimary, fontWeight: "700", textAlign: "center" },
          ]}
        >
          Final
        </Text>
      );
    }
    if (scheduled) {
      return (
        <View style={{ alignItems: "center" }}>
          <Text
            style={[
              text.bodyMd,
              { color: c.textPrimary, fontWeight: "800", textAlign: "center" },
            ]}
          >
            {start || "TBD"}
          </Text>
        </View>
      );
    }
    return (
      <Text
        style={[
          text.labelMd,
          { color: c.textMuted, fontWeight: "700", textAlign: "center" },
        ]}
      >
        {phaseShortLabel(m.phase, m.clock).slice(0, 4)}
      </Text>
    );
  };

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
        {/* Home block: logo on top, name below, record under name */}
        <View style={styles.teamBlock}>
          <TeamLogo
            url={m.home_team.logo_url}
            name={m.home_team.short_name || m.home_team.name}
            size={36}
          />
          <Text
            numberOfLines={2}
            style={[
              styles.teamNameStacked,
              {
                color: homeLost ? c.textMuted : c.textPrimary,
                fontWeight: homeWin || live ? "800" : "700",
              },
            ]}
          >
            {m.home_team.name || m.home_team.short_name}
          </Text>
        </View>

        {/* Home score */}
        <View style={styles.scoreCol}>
          {!scheduled && (
            <Text
              style={[
                styles.bigScore,
                {
                  color: homeLost ? c.textMuted : c.textPrimary,
                  fontWeight: homeWin || live ? "900" : "800",
                },
              ]}
            >
              {m.score.home}
            </Text>
          )}
        </View>

        {/* Center pillar: status / clock */}
        <View style={styles.centerCol}>{renderCenter()}</View>

        {/* Away score */}
        <View style={styles.scoreCol}>
          {!scheduled && (
            <Text
              style={[
                styles.bigScore,
                {
                  color: awayLost ? c.textMuted : c.textPrimary,
                  fontWeight: awayWin || live ? "900" : "800",
                  textAlign: "left",
                },
              ]}
            >
              {m.score.away}
            </Text>
          )}
        </View>

        {/* Away block: logo on top, name below */}
        <View style={styles.teamBlock}>
          <TeamLogo
            url={m.away_team.logo_url}
            name={m.away_team.short_name || m.away_team.name}
            size={36}
          />
          <Text
            numberOfLines={2}
            style={[
              styles.teamNameStacked,
              {
                color: awayLost ? c.textMuted : c.textPrimary,
                fontWeight: awayWin || live ? "800" : "700",
              },
            ]}
          >
            {m.away_team.name || m.away_team.short_name}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

interface DayOption {
  key: "yesterday" | "today" | "upcoming";
  label: string;
}

function DayStrip({
  active,
  onSelect,
  c,
}: {
  active: DayOption["key"];
  onSelect: (k: DayOption["key"]) => void;
  c: typeof colors.dark;
}) {
  const opts: DayOption[] = [
    { key: "yesterday", label: "Yesterday" },
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
  ];
  return (
    <View
      style={[
        styles.dayStrip,
        { borderBottomColor: c.surfaceBorder, backgroundColor: c.surface },
      ]}
    >
      {opts.map((o) => {
        const isActive = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            style={({ pressed }) => [
              styles.dayCell,
              {
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                text.bodyMd,
                {
                  color: isActive ? c.textPrimary : c.textMuted,
                  fontWeight: isActive ? "800" : "600",
                  textAlign: "center",
                },
              ]}
            >
              {o.label}
            </Text>
            {isActive && (
              <View
                style={[
                  styles.dayUnderline,
                  { backgroundColor: c.accentGreen },
                ]}
              />
            )}
          </Pressable>
        );
      })}
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sportIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 100,
  },
  teamBlock: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    gap: 6,
  },
  teamNameStacked: {
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
  },
  scoreCol: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  bigScore: {
    fontSize: 32,
    lineHeight: 36,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  centerCol: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dayStrip: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    position: "relative",
  },
  dayUnderline: {
    position: "absolute",
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    height: 3,
    borderRadius: 2,
  },
});
