import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Star } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchMatch, type MatchDetailResponse } from "@/src/api";
import { TeamLogo } from "@/src/components/TeamLogo";
import { isFinished, isLive, isScheduled, phaseShortLabel } from "@/src/match-utils";
import { usePreferences } from "@/src/preferences-context";
import { colors, radii, spacing, text } from "@/src/theme";

type Tab = "recap" | "stats" | "plays";

export default function MatchDetailScreen() {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isFavorite, toggleFavorite } = usePreferences();

  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("recap");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetchMatch(id, ctrl.signal);
      setData(res);
      setError(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError("Couldn't load this match.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [load]);

  if (loading && !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.surface }]}>
        <ActivityIndicator color={c.accentGreen} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.surface }]}>
        <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
          {error ?? "Match not found."}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtnLg,
            { backgroundColor: c.accentBlue, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[text.bodyMd, { color: "#fff", fontWeight: "700" }]}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const m = data.match;
  const state = data.state;
  const phase = m.phase ?? "scheduled";
  const live = isLive(phase);
  const finished = isFinished(phase);
  const scheduled = isScheduled(phase);
  const homeScore = state?.score_home ?? m.score.home ?? 0;
  const awayScore = state?.score_away ?? m.score.away ?? 0;
  const clock = state?.clock ?? m.clock;
  const period = state?.period ?? m.period;
  const homeWin = finished && homeScore > awayScore;
  const awayWin = finished && awayScore > homeScore;
  const homeLost = finished && awayScore > homeScore;
  const awayLost = finished && homeScore > awayScore;

  const startLabel = m.start_time
    ? new Date(m.start_time).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

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
            <Text style={[text.labelMd, { color: c.textPrimary, fontWeight: "700" }]}>
              Back
            </Text>
          </Pressable>
          <View style={styles.leagueChip}>
            {data.league && (
              <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", letterSpacing: 0.4 }]}>
                {(data.league.short_name || data.league.name).toUpperCase()}
              </Text>
            )}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing["2xl"] }}
        showsVerticalScrollIndicator={false}
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
      >
        {/* Status pill */}
        <View style={styles.statusWrap}>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: live
                  ? c.accentRed + "22"
                  : finished
                    ? c.surfaceCard
                    : c.surfaceCard,
                borderColor: live ? c.accentRed + "55" : c.surfaceBorder,
              },
            ]}
          >
            {live && <View style={[styles.liveDot, { backgroundColor: c.accentRed }]} />}
            <Text
              style={[
                text.labelMd,
                {
                  color: live ? c.accentRed : c.textSecondary,
                  fontWeight: "900",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                },
              ]}
            >
              {live
                ? "Live"
                : finished
                  ? "Final"
                  : scheduled
                    ? "Scheduled"
                    : (phaseShortLabel(phase, clock) || phase)}
            </Text>
            {live && clock && (
              <Text
                style={[
                  text.labelMd,
                  { color: c.textPrimary, fontWeight: "800", marginLeft: 4 },
                ]}
              >
                · {clock}
              </Text>
            )}
          </View>
          {!!period && (
            <Text style={[text.labelMd, { color: c.textMuted, marginTop: 6 }]}>
              {period}
            </Text>
          )}
        </View>

        {/* Hero score */}
        <View style={styles.hero}>
          <View style={styles.heroSide}>
            <Pressable onPress={() => toggleFavorite(m.home_team.id)} hitSlop={6} style={styles.logoPress}>
              <TeamLogo
                url={m.home_team.logo_url}
                name={m.home_team.short_name || m.home_team.name}
                size={72}
              />
              {isFavorite(m.home_team.id) && (
                <View style={[styles.favBadge, { backgroundColor: c.accentAmber }]}>
                  <Star size={11} color="#000" fill="#000" strokeWidth={2} />
                </View>
              )}
            </Pressable>
            <Text
              numberOfLines={2}
              style={[
                styles.heroName,
                {
                  color: homeLost ? c.textMuted : c.textPrimary,
                  fontWeight: homeWin || live ? "800" : "700",
                },
              ]}
            >
              {m.home_team.name || m.home_team.short_name}
            </Text>
            {!!m.home_team.short_name && (
              <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700" }]}>
                {m.home_team.short_name}
              </Text>
            )}
          </View>

          <View style={styles.heroCenter}>
            {scheduled ? (
              <Text style={[styles.heroVs, { color: c.textTertiary }]}>vs</Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={[
                    styles.heroScore,
                    {
                      color: homeLost ? c.textMuted : c.textPrimary,
                      fontWeight: homeWin || live ? "900" : "800",
                    },
                  ]}
                >
                  {homeScore}
                </Text>
                <Text style={[styles.heroSep, { color: c.textDim }]}>—</Text>
                <Text
                  style={[
                    styles.heroScore,
                    {
                      color: awayLost ? c.textMuted : c.textPrimary,
                      fontWeight: awayWin || live ? "900" : "800",
                    },
                  ]}
                >
                  {awayScore}
                </Text>
              </View>
            )}
            {scheduled && !!startLabel && (
              <Text style={[text.labelMd, { color: c.textMuted, marginTop: 8, textAlign: "center" }]}>
                {startLabel}
              </Text>
            )}
          </View>

          <View style={styles.heroSide}>
            <Pressable onPress={() => toggleFavorite(m.away_team.id)} hitSlop={6} style={styles.logoPress}>
              <TeamLogo
                url={m.away_team.logo_url}
                name={m.away_team.short_name || m.away_team.name}
                size={72}
              />
              {isFavorite(m.away_team.id) && (
                <View style={[styles.favBadge, { backgroundColor: c.accentAmber }]}>
                  <Star size={11} color="#000" fill="#000" strokeWidth={2} />
                </View>
              )}
            </Pressable>
            <Text
              numberOfLines={2}
              style={[
                styles.heroName,
                {
                  color: awayLost ? c.textMuted : c.textPrimary,
                  fontWeight: awayWin || live ? "800" : "700",
                },
              ]}
            >
              {m.away_team.name || m.away_team.short_name}
            </Text>
            {!!m.away_team.short_name && (
              <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700" }]}>
                {m.away_team.short_name}
              </Text>
            )}
          </View>
        </View>

        {/* Venue + date footer */}
        {(m.venue || (!scheduled && startLabel)) && (
          <View style={[styles.metaCard, { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder }]}>
            {!!m.venue && (
              <View style={styles.metaRow}>
                <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", letterSpacing: 0.5 }]}>
                  VENUE
                </Text>
                <Text style={[text.bodySm, { color: c.textPrimary, fontWeight: "700" }]}>
                  {m.venue}
                </Text>
              </View>
            )}
            {!!startLabel && (
              <View style={styles.metaRow}>
                <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", letterSpacing: 0.5 }]}>
                  {scheduled ? "STARTS" : "DATE"}
                </Text>
                <Text style={[text.bodySm, { color: c.textPrimary, fontWeight: "700" }]}>
                  {startLabel}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Tab strip */}
        <View style={[styles.tabStrip, { borderBottomColor: c.surfaceBorder }]}>
          {(["recap", "stats", "plays"] as Tab[]).map((t) => {
            const isActive = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={({ pressed }) => [styles.tabCell, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text
                  style={[
                    text.bodyMd,
                    {
                      color: isActive ? c.textPrimary : c.textMuted,
                      fontWeight: isActive ? "800" : "600",
                    },
                  ]}
                >
                  {t === "recap" ? "Recap" : t === "stats" ? "Stats" : "Plays"}
                </Text>
                {isActive && (
                  <View style={[styles.tabUnderline, { backgroundColor: c.accentGreen }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={styles.tabBody}>
          {tab === "recap" && <RecapPane c={c} live={live} finished={finished} scheduled={scheduled} />}
          {tab === "stats" && <ComingSoon c={c} title="Team stats" body="Box-score and shot-chart land soon." />}
          {tab === "plays" && <ComingSoon c={c} title="Play-by-play" body="Live drives and key plays arrive in the next update." />}
        </View>
      </ScrollView>
    </View>
  );
}

function RecapPane({
  c,
  live,
  finished,
  scheduled,
}: {
  c: typeof colors.dark;
  live: boolean;
  finished: boolean;
  scheduled: boolean;
}) {
  const headline = live
    ? "Match in progress"
    : finished
      ? "Match finished"
      : scheduled
        ? "Match starts soon"
        : "Match update";
  const body = live
    ? "We'll auto-refresh every 15 seconds while play continues."
    : finished
      ? "Final score above. A full recap with stats and plays will appear here once available."
      : scheduled
        ? "We'll show live score updates and plays once the match kicks off."
        : "Check back shortly for the latest update.";
  return (
    <View style={[styles.card, { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder }]}>
      <Text style={[text.headingSm, { color: c.textPrimary, marginBottom: 6 }]}>
        {headline}
      </Text>
      <Text style={[text.bodySm, { color: c.textSecondary, lineHeight: 22 }]}>{body}</Text>
    </View>
  );
}

function ComingSoon({ c, title, body }: { c: typeof colors.dark; title: string; body: string }) {
  return (
    <View style={[styles.card, { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder }]}>
      <Text style={[text.headingSm, { color: c.textPrimary, marginBottom: 6 }]}>{title}</Text>
      <Text style={[text.bodySm, { color: c.textMuted, lineHeight: 22 }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  backBtnLg: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
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
  leagueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusWrap: {
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  heroSide: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
  },
  logoPress: {
    position: "relative",
  },
  favBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  heroCenter: {
    minWidth: 130,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
  },
  heroScore: {
    fontSize: 56,
    lineHeight: 60,
    fontVariant: ["tabular-nums"],
    letterSpacing: -2,
    minWidth: 50,
    textAlign: "center",
  },
  heroSep: {
    fontSize: 28,
    fontWeight: "300",
  },
  heroVs: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 1,
  },
  metaCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  tabStrip: {
    flexDirection: "row",
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    position: "relative",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: 3,
    borderRadius: 2,
  },
  tabBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
});
