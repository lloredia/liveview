import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
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

import { fetchToday, type LeagueGroup, type TodayResponse } from "@/src/api";
import { SportIcon } from "@/src/components/SportIcon";
import { TeamLogo } from "@/src/components/TeamLogo";
import { isLive } from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";

export default function LeaguesScreen() {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];
  const router = useRouter();

  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    fetchToday()
      .then((r) => setData(r))
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const leagues = (data?.leagues ?? [])
    .filter((lg) => lg.matches.length > 0)
    .slice()
    .sort((a, b) => b.matches.length - a.matches.length);

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
          <Text style={[text.headingSm, { color: c.textPrimary }]}>Leagues</Text>
          <View style={{ width: 64 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accentGreen} />
        </View>
      ) : leagues.length === 0 ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
            No leagues with matches today.
          </Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(lg) => lg.league_id}
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
            <LeagueCard
              league={item}
              c={c}
              onPress={() =>
                router.push({ pathname: "/leagues/[id]", params: { id: item.league_id } })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function LeagueCard({
  league: lg,
  c,
  onPress,
}: {
  league: LeagueGroup;
  c: typeof colors.dark;
  onPress: () => void;
}) {
  const liveCount = lg.matches.filter((m) => isLive(m.phase)).length;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.surfaceHover : c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      {lg.league_logo_url ? (
        <TeamLogo url={lg.league_logo_url} name={lg.league_short_name || lg.league_name} size={36} />
      ) : (
        <View
          style={[
            styles.sportWrap,
            { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder },
          ]}
        >
          <SportIcon sport={lg.sport} size={18} color={c.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text numberOfLines={1} style={[text.bodyMd, { color: c.textPrimary, fontWeight: "800" }]}>
          {lg.league_short_name || lg.league_name}
        </Text>
        <Text numberOfLines={1} style={[text.labelSm, { color: c.textMuted, marginTop: 2 }]}>
          {(lg.league_country || lg.sport_type || lg.sport).toUpperCase()}
        </Text>
      </View>
      {liveCount > 0 && (
        <View style={[styles.livePill, { backgroundColor: c.accentRed + "22" }]}>
          <View style={[styles.liveDot, { backgroundColor: c.accentRed }]} />
          <Text style={[text.labelXs, { color: c.accentRed, fontWeight: "800" }]}>
            {liveCount} LIVE
          </Text>
        </View>
      )}
      <View style={[styles.countChip, { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder }]}>
        <Text style={[text.labelSm, { color: c.textSecondary, fontWeight: "800" }]}>
          {lg.matches.length}
        </Text>
      </View>
      <Text style={[text.bodyMd, { color: c.textMuted, marginLeft: 6 }]}>›</Text>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sportWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  countChip: {
    minWidth: 32,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});
