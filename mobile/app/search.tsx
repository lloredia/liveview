import { Stack, useRouter } from "expo-router";
import { Search as SearchIcon, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchToday, type LeagueGroup, type MatchSummary, type TodayResponse } from "@/src/api";
import { TeamLogo } from "@/src/components/TeamLogo";
import { isFinished, isLive, isScheduled, phaseShortLabel } from "@/src/match-utils";
import { colors, radii, spacing, text } from "@/src/theme";

interface MatchHit {
  type: "match";
  match: MatchSummary;
  league: LeagueGroup;
}
interface LeagueHit {
  type: "league";
  league: LeagueGroup;
}
type Hit = MatchHit | LeagueHit;

export default function SearchScreen() {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchToday()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    if (!data || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const out: Hit[] = [];
    for (const lg of data.leagues) {
      const lgName = (lg.league_name || "").toLowerCase();
      const lgShort = (lg.league_short_name || "").toLowerCase();
      if (lgName.includes(q) || lgShort.includes(q)) {
        out.push({ type: "league", league: lg });
      }
      for (const m of lg.matches) {
        const home = `${m.home_team.name} ${m.home_team.short_name}`.toLowerCase();
        const away = `${m.away_team.name} ${m.away_team.short_name}`.toLowerCase();
        if (home.includes(q) || away.includes(q)) {
          out.push({ type: "match", match: m, league: lg });
        }
      }
    }
    return out.slice(0, 60);
  }, [data, query]);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.surface }}>
        <View style={styles.searchBar}>
          <View style={[styles.searchField, { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder }]}>
            <SearchIcon size={18} color={c.textMuted} strokeWidth={2.2} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search teams or leagues"
              placeholderTextColor={c.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[styles.searchInput, { color: c.textPrimary }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <X size={16} color={c.textMuted} strokeWidth={2.2} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={[text.bodyMd, { color: c.accentBlue, fontWeight: "700" }]}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accentGreen} />
        </View>
      ) : query.trim().length < 2 ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
            Search for any team or league playing today.
          </Text>
        </View>
      ) : hits.length === 0 ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>
            No matches for "{query}".
          </Text>
        </View>
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(h, idx) => (h.type === "match" ? `m-${h.match.id}` : `l-${h.league.league_id}-${idx}`)}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.type === "match" ? (
              <MatchHitRow hit={item} c={c} onPress={() => router.push({ pathname: "/match/[id]", params: { id: item.match.id } })} />
            ) : (
              <LeagueHitRow hit={item} c={c} onPress={() => router.push({ pathname: "/leagues/[id]", params: { id: item.league.league_id } })} />
            )
          }
        />
      )}
    </View>
  );
}

function MatchHitRow({ hit, c, onPress }: { hit: MatchHit; c: typeof colors.dark; onPress: () => void }) {
  const m = hit.match;
  const live = isLive(m.phase);
  const finished = isFinished(m.phase);
  const scheduled = isScheduled(m.phase);
  const status = live ? "LIVE" : finished ? "Final" : scheduled ? "Today" : phaseShortLabel(m.phase, m.clock);
  const start = m.start_time
    ? new Date(m.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitRow,
        { backgroundColor: pressed ? c.surfaceHover : c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <TeamLogo url={m.home_team.logo_url} name={m.home_team.short_name} size={22} />
        <TeamLogo url={m.away_team.logo_url} name={m.away_team.short_name} size={22} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text numberOfLines={1} style={[text.bodySm, { color: c.textPrimary, fontWeight: "700" }]}>
          {m.home_team.short_name || m.home_team.name} vs {m.away_team.short_name || m.away_team.name}
        </Text>
        <Text numberOfLines={1} style={[text.labelSm, { color: c.textMuted, marginTop: 2 }]}>
          {hit.league.league_short_name || hit.league.league_name}
          {scheduled && start ? ` · ${start}` : ""}
        </Text>
      </View>
      <View
        style={[
          styles.statusChip,
          {
            backgroundColor: live ? c.accentRed + "22" : c.surfaceCard,
            borderColor: live ? c.accentRed + "55" : c.surfaceBorder,
          },
        ]}
      >
        <Text
          style={[
            text.labelXs,
            {
              color: live ? c.accentRed : c.textSecondary,
              fontWeight: "800",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            },
          ]}
        >
          {status}
        </Text>
      </View>
    </Pressable>
  );
}

function LeagueHitRow({ hit, c, onPress }: { hit: LeagueHit; c: typeof colors.dark; onPress: () => void }) {
  const lg = hit.league;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitRow,
        { backgroundColor: pressed ? c.surfaceHover : c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      <TeamLogo url={lg.league_logo_url} name={lg.league_short_name || lg.league_name} size={28} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text numberOfLines={1} style={[text.bodySm, { color: c.textPrimary, fontWeight: "800" }]}>
          {lg.league_short_name || lg.league_name}
        </Text>
        <Text numberOfLines={1} style={[text.labelSm, { color: c.textMuted, marginTop: 2 }]}>
          {(lg.league_country || lg.sport_type || "").toUpperCase()} · {lg.matches.length} match
          {lg.matches.length === 1 ? "" : "es"}
        </Text>
      </View>
      <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700" }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
});
