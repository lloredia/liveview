import { useRouter } from "expo-router";
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
import { MatchRowSkeleton } from "@/src/components/Skeleton";
import { usePreferences } from "@/src/preferences-context";
import { ChevronDown, ChevronRight, LayoutGrid, Search, Star } from "lucide-react-native";

interface Row {
  type: "league-header" | "match";
  key: string;
  league?: LeagueGroup;
  match?: MatchSummary;
}

type Filter = "all" | "live" | "favorites";
type DayKey = "yesterday" | "today" | "upcoming";

function dateForDay(day: DayKey): string {
  const d = new Date();
  if (day === "yesterday") d.setDate(d.getDate() - 1);
  else if (day === "upcoming") d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** live → scheduled (by start_time asc) → finished. */
function sortMatches(matches: MatchSummary[]): MatchSummary[] {
  const rank = (m: MatchSummary): number => {
    if (isLive(m.phase)) return 0;
    if (isScheduled(m.phase)) return 1;
    if (isFinished(m.phase)) return 2;
    return 3;
  };
  return [...matches].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
    const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
    return ta - tb;
  });
}

function buildRows(
  today: TodayResponse | null,
  filter: Filter,
  collapsed: Set<string>,
  favorites: Set<string>,
): Row[] {
  if (!today) return [];
  const rows: Row[] = [];
  for (const lg of today.leagues) {
    if (!lg.matches.length) continue;
    let filtered = lg.matches;
    if (filter === "live") filtered = filtered.filter((m) => isLive(m.phase));
    else if (filter === "favorites")
      filtered = filtered.filter(
        (m) => favorites.has(m.home_team.id) || favorites.has(m.away_team.id),
      );
    if (!filtered.length) continue;
    const sorted = sortMatches(filtered);
    rows.push({ type: "league-header", key: `lg-${lg.league_id}`, league: { ...lg, matches: sorted } });
    if (collapsed.has(lg.league_id)) continue;
    for (const m of sorted) {
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
  const router = useRouter();
  const { favorites } = usePreferences();
  const favCount = favorites.size;

  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<DayKey>("today");
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);

  const toggleLeague = useCallback((leagueId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(leagueId)) next.delete(leagueId);
      else next.add(leagueId);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const date = dateForDay(day);
      const res = await fetchToday(ctrl.signal, { date });
      setData(res);
      setError(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError("Couldn't load scores. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [day]);

  useEffect(() => {
    setLoading(true);
    load();
    // Only auto-refresh today; yesterday/upcoming don't tick.
    if (day !== "today") return () => abortRef.current?.abort();
    const interval = setInterval(load, 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [load, day]);

  const rows = buildRows(data, filter, collapsed, favorites);
  const liveCount = data?.live ?? 0;
  const totalCount = data?.total_matches ?? 0;

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === "league-header" && item.league) {
      return (
        <LeagueHeader
          league={item.league}
          c={c}
          collapsed={collapsed.has(item.league.league_id)}
          onToggle={() => toggleLeague(item.league!.league_id)}
        />
      );
    }
    if (item.type === "match" && item.match) {
      return <MatchRow match={item.match} c={c} router={router} />;
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.surface }}>
        {/* Hero header */}
        <View style={styles.heroHeader}>
          <View style={styles.heroTop}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flex: 1 }}>
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
            <Pressable
              onPress={() => router.push("/leagues")}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: pressed ? c.surfaceHover : c.surfaceCard,
                  borderColor: c.surfaceBorder,
                },
              ]}
            >
              <LayoutGrid size={18} color={c.textPrimary} strokeWidth={2.2} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/search")}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: pressed ? c.surfaceHover : c.surfaceCard,
                  borderColor: c.surfaceBorder,
                },
              ]}
            >
              <Search size={18} color={c.textPrimary} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={[text.labelMd, { color: c.textMuted, marginTop: 2 }]}>
            {totalCount > 0
              ? `${totalCount} matches today`
              : "Today"}
          </Text>
        </View>
        <DayStrip active={day} onSelect={setDay} c={c} />
        <FilterPills
          active={filter}
          onSelect={setFilter}
          liveCount={liveCount}
          totalCount={totalCount}
          favCount={favCount}
          c={c}
        />
      </SafeAreaView>

      {loading && !data ? (
        <View>
          {Array.from({ length: 8 }).map((_, i) => (
            <MatchRowSkeleton key={i} scheme={scheme} />
          ))}
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

function LeagueHeader({
  league: lg,
  c,
  collapsed,
  onToggle,
}: {
  league: LeagueGroup;
  c: typeof colors.dark;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.leagueHeader,
        {
          backgroundColor: pressed ? c.surfaceHover : c.surface,
          borderBottomColor: c.surfaceBorder,
        },
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
      <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", marginRight: 6 }]}>
        {lg.matches.length}
      </Text>
      <Chevron size={16} color={c.textMuted} strokeWidth={2.5} />
    </Pressable>
  );
}

function MatchRow({
  match: m,
  c,
  router,
}: {
  match: MatchSummary;
  c: typeof colors.dark;
  router: ReturnType<typeof useRouter>;
}) {
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

  const renderCenter = () => {
    if (live) {
      return (
        <View style={{ alignItems: "center" }}>
          <View style={styles.liveRow}>
            <View style={[styles.liveDotSm, { backgroundColor: c.accentRed }]} />
            <Text
              style={[
                text.labelSm,
                { color: c.accentRed, fontWeight: "900", letterSpacing: 0.4 },
              ]}
            >
              LIVE
            </Text>
          </View>
          {m.clock && (
            <Text style={[text.labelSm, { color: c.textPrimary, marginTop: 2 }]}>
              {m.clock}
            </Text>
          )}
          {m.period && (
            <Text style={[text.labelXs, { color: c.textMuted, marginTop: 1 }]}>
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
            text.labelLg,
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
            numberOfLines={1}
            style={[
              text.labelLg,
              { color: c.textPrimary, fontWeight: "800", textAlign: "center" },
            ]}
          >
            {start || "TBD"}
          </Text>
          {!!m.venue && (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.venueText, { color: c.textMuted }]}
            >
              {m.venue}
            </Text>
          )}
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
    <Pressable
      onPress={() => router.push({ pathname: "/match/[id]", params: { id: m.id } })}
      style={({ pressed }) => [
        styles.matchRow,
        {
          backgroundColor: pressed ? c.surfaceHover : c.surface,
          borderBottomColor: c.surfaceBorder,
        },
      ]}
    >
      {/* Home block: small logo + name on the same horizontal line */}
      <View style={styles.teamBlock}>
        <TeamLogo
          url={m.home_team.logo_url}
          name={m.home_team.short_name || m.home_team.name}
          size={28}
        />
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.teamNameInline,
            {
              color: homeLost ? c.textMuted : c.textPrimary,
              fontWeight: homeWin || live ? "800" : "700",
            },
          ]}
        >
          {m.home_team.short_name || m.home_team.name}
        </Text>
      </View>

      <Text
        style={[
          styles.bigScore,
          {
            color: homeLost ? c.textMuted : c.textPrimary,
            fontWeight: homeWin || live ? "900" : "800",
            opacity: scheduled ? 0 : 1,
          },
        ]}
      >
        {m.score.home}
      </Text>

      <View style={styles.centerCol}>{renderCenter()}</View>

      <Text
        style={[
          styles.bigScore,
          {
            color: awayLost ? c.textMuted : c.textPrimary,
            fontWeight: awayWin || live ? "900" : "800",
            opacity: scheduled ? 0 : 1,
          },
        ]}
      >
        {m.score.away}
      </Text>

      <View style={[styles.teamBlock, { justifyContent: "flex-end" }]}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.teamNameInline,
            {
              color: awayLost ? c.textMuted : c.textPrimary,
              fontWeight: awayWin || live ? "800" : "700",
              textAlign: "right",
            },
          ]}
        >
          {m.away_team.short_name || m.away_team.name}
        </Text>
        <TeamLogo
          url={m.away_team.logo_url}
          name={m.away_team.short_name || m.away_team.name}
          size={28}
        />
      </View>
    </Pressable>
  );
}

function FilterPills({
  active,
  onSelect,
  liveCount,
  totalCount,
  favCount,
  c,
}: {
  active: Filter;
  onSelect: (k: Filter) => void;
  liveCount: number;
  totalCount: number;
  favCount: number;
  c: typeof colors.dark;
}) {
  const opts: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalCount },
    { key: "live", label: "Live", count: liveCount },
    { key: "favorites", label: "Favorites", count: favCount },
  ];
  return (
    <View
      style={[
        styles.filterStrip,
        { borderBottomColor: c.surfaceBorder, backgroundColor: c.surface },
      ]}
    >
      {opts.map((o) => {
        const isActive = o.key === active;
        const tint = isActive
          ? o.key === "live"
            ? c.accentRed
            : o.key === "favorites"
              ? c.accentAmber
              : c.accentGreen
          : c.surfaceCard;
        const labelColor = isActive ? "#000" : c.textSecondary;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            style={({ pressed }) => [
              styles.filterPill,
              { backgroundColor: tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {o.key === "live" && o.count > 0 && (
              <View
                style={[
                  styles.liveDotSm,
                  { backgroundColor: isActive ? "#000" : c.accentRed },
                ]}
              />
            )}
            {o.key === "favorites" && (
              <Star
                size={12}
                color={isActive ? "#000" : c.accentAmber}
                fill={isActive ? "#000" : c.accentAmber}
                strokeWidth={2}
              />
            )}
            <Text
              style={[
                text.labelMd,
                {
                  color: labelColor,
                  fontWeight: "800",
                  letterSpacing: 0.3,
                },
              ]}
            >
              {o.label}
            </Text>
            <Text
              style={[
                text.labelSm,
                {
                  color: isActive ? "#000" : c.textMuted,
                  fontWeight: "700",
                },
              ]}
            >
              {o.count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DayStrip({
  active,
  onSelect,
  c,
}: {
  active: DayKey;
  onSelect: (k: DayKey) => void;
  c: typeof colors.dark;
}) {
  const opts: { key: DayKey; label: string }[] = [
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
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  teamNameInline: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  bigScore: {
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  centerCol: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
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
  filterStrip: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  venueText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 3,
  },
});
