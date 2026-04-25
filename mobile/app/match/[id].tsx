import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchMatch, type MatchDetailResponse } from "@/src/api";
import { isFinished, isLive, isScheduled, phaseShortLabel } from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";

export default function MatchDetailScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            styles.btn,
            { backgroundColor: c.accentBlue, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[text.bodyMd, { color: "#fff", fontWeight: "700" }]}>
            Back
          </Text>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { borderBottomColor: c.surfaceBorder }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            {
              borderColor: c.surfaceBorder,
              backgroundColor: pressed ? c.surfaceHover : c.surfaceCard,
            },
          ]}
        >
          <Text style={[text.bodySm, { color: c.accentBlue, fontWeight: "600" }]}>
            ← Back
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text style={[text.labelMd, { color: c.textMuted }]}>
          {data.league.short_name || data.league.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Score header */}
        <View
          style={[
            styles.scoreCard,
            {
              backgroundColor: c.surfaceCard,
              borderColor: live ? c.accentRed + "33" : c.surfaceBorder,
            },
          ]}
        >
          <View style={styles.statusPill}>
            {live && <View style={[styles.liveDot, { backgroundColor: c.accentRed }]} />}
            <Text
              style={[
                text.labelMd,
                {
                  color: live ? c.accentRed : finished ? c.textMuted : c.textSecondary,
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                },
              ]}
            >
              {live
                ? phaseShortLabel(phase, clock) || "LIVE"
                : finished
                  ? "FULL TIME"
                  : scheduled
                    ? "SCHEDULED"
                    : phase}
            </Text>
            {clock && live && (
              <Text style={[text.labelMd, { color: c.accentRed }]}>· {clock}</Text>
            )}
          </View>

          <View style={styles.scoreRow}>
            <View style={styles.teamBlock}>
              <Text
                style={[text.headingSm, { color: c.textPrimary, textAlign: "center" }]}
              >
                {m.home_team.short_name || m.home_team.name}
              </Text>
              <Text style={[text.labelMd, { color: c.textMuted, marginTop: spacing.xs }]}>
                {m.home_team.name}
              </Text>
            </View>

            <View style={styles.scoreBlock}>
              {scheduled ? (
                <Text style={[text.headingMd, { color: c.textMuted }]}>vs</Text>
              ) : (
                <Text
                  style={[
                    text.scoreLg,
                    {
                      color: c.textPrimary,
                      fontVariant: ["tabular-nums"],
                    },
                  ]}
                >
                  {homeScore}
                  <Text style={{ color: c.textMuted }}> · </Text>
                  {awayScore}
                </Text>
              )}
              {period && (
                <Text style={[text.labelMd, { color: c.textMuted, marginTop: spacing.xs }]}>
                  {period}
                </Text>
              )}
            </View>

            <View style={styles.teamBlock}>
              <Text
                style={[text.headingSm, { color: c.textPrimary, textAlign: "center" }]}
              >
                {m.away_team.short_name || m.away_team.name}
              </Text>
              <Text style={[text.labelMd, { color: c.textMuted, marginTop: spacing.xs }]}>
                {m.away_team.name}
              </Text>
            </View>
          </View>

          {m.venue && (
            <Text
              style={[
                text.labelMd,
                {
                  color: c.textMuted,
                  textAlign: "center",
                  marginTop: spacing.lg,
                },
              ]}
            >
              {m.venue}
              {m.start_time
                ? ` · ${new Date(m.start_time).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : ""}
            </Text>
          )}
        </View>

        <Text
          style={[
            text.labelMd,
            {
              color: c.textTertiary,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              marginTop: spacing.xl,
              marginBottom: spacing.sm,
            },
          ]}
        >
          More
        </Text>
        <Text style={[text.bodySm, { color: c.textMuted }]}>
          Play-by-play, lineups, and team stats arrive next.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  scoreCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  teamBlock: {
    flex: 1,
    alignItems: "center",
  },
  scoreBlock: {
    alignItems: "center",
    minWidth: 120,
  },
});
