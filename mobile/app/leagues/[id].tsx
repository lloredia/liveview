import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
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

import { fetchToday, type LeagueGroup, type MatchSummary } from "@/src/api";
import { TeamLogo } from "@/src/components/TeamLogo";
import { isFinished, isLive, isScheduled, phaseShortLabel } from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";

function rank(m: MatchSummary): number {
  if (isLive(m.phase)) return 0;
  if (isScheduled(m.phase)) return 1;
  if (isFinished(m.phase)) return 2;
  return 3;
}

export default function LeagueDetailScreen() {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [league, setLeague] = useState<LeagueGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    fetchToday()
      .then((r) => {
        const lg = r.leagues.find((l) => l.league_id === id) ?? null;
        setLeague(lg);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const matches = (league?.matches ?? []).slice().sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
    const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
    return ta - tb;
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.surface }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backChip,
              {
                borderColor: c.surfaceBorder,
                backgroundColor: pressed ? c.surfaceHover : c.surfaceCard,
              },
            ]}
          >
            <ChevronLeft size={18} color={c.textPrimary} strokeWidth={2.5} />
            <Text style={[text.labelMd, { color: c.textPrimary, fontWeight: "700" }]}>Back</Text>
          </Pressable>
          <View style={{ width: 64 }} />
        </View>

        {league && (
          <View style={styles.heroRow}>
            <TeamLogo
              url={league.league_logo_url}
              name={league.league_short_name || league.league_name}
              size={44}
            />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text numberOfLines={1} style={[text.headingSm, { color: c.textPrimary }]}>
                {league.league_short_name || league.league_name}
              </Text>
              <Text style={[text.labelMd, { color: c.textMuted, marginTop: 2 }]}>
                {(league.league_country || league.sport_type || league.sport).toUpperCase()} ·
                {" "}
                {league.matches.length} match{league.matches.length === 1 ? "" : "es"}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accentGreen} />
        </View>
      ) : !league ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
            League not found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
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
          renderItem={({ item }) => (
            <Row
              match={item}
              c={c}
              onPress={() => router.push({ pathname: "/match/[id]", params: { id: item.id } })}
            />
          )}
        />
      )}
    </View>
  );
}

function Row({ match: m, c, onPress }: { match: MatchSummary; c: typeof colors.dark; onPress: () => void }) {
  const live = isLive(m.phase);
  const finished = isFinished(m.phase);
  const scheduled = isScheduled(m.phase);
  const homeWin = finished && m.score.home > m.score.away;
  const awayWin = finished && m.score.away > m.score.home;
  const homeLost = finished && m.score.away > m.score.home;
  const awayLost = finished && m.score.home > m.score.away;
  const start = m.start_time
    ? new Date(m.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  const center = live
    ? "LIVE"
    : finished
      ? "Final"
      : scheduled
        ? start || "TBD"
        : phaseShortLabel(m.phase, m.clock);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.matchRow,
        { backgroundColor: pressed ? c.surfaceHover : c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      <View style={styles.teamBlock}>
        <TeamLogo url={m.home_team.logo_url} name={m.home_team.short_name || m.home_team.name} size={28} />
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

      <View style={styles.centerCol}>
        {live && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={[styles.liveDotSm, { backgroundColor: c.accentRed }]} />
            <Text style={[text.labelSm, { color: c.accentRed, fontWeight: "900" }]}>LIVE</Text>
          </View>
        )}
        {!live && (
          <Text
            numberOfLines={1}
            style={[
              text.labelLg,
              { color: c.textPrimary, fontWeight: "800", textAlign: "center" },
            ]}
          >
            {center}
          </Text>
        )}
      </View>

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
        <TeamLogo url={m.away_team.logo_url} name={m.away_team.short_name || m.away_team.name} size={28} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
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
  liveDotSm: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
