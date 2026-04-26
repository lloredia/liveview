import { Image } from "expo-image";
import { Newspaper } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchNews, type NewsArticle } from "@/src/api";
import { NewsRowSkeleton } from "@/src/components/Skeleton";
import { usePreferences } from "@/src/preferences-context";
import { colors, radii, spacing, text } from "@/src/theme";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NewsScreen() {
  const { scheme } = usePreferences();
  const c = colors[scheme];

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetchNews(ctrl.signal, { page: 1, limit: 30 });
      // Dedup syndicated copies of the same article (same title and same source family).
      const seen = new Set<string>();
      const deduped: NewsArticle[] = [];
      for (const a of res.articles) {
        const key = a.title.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(a);
      }
      setArticles(deduped);
      setError(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setError("Couldn't load news.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const open = (url: string) => {
    if (url) void Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.surface }}>
        <View style={styles.heroHeader}>
          <Text style={[text.headingLg, { color: c.textPrimary, letterSpacing: -0.5 }]}>
            News
          </Text>
          <Text style={[text.labelMd, { color: c.textMuted, marginTop: 2 }]}>
            Latest from across the leagues
          </Text>
        </View>
      </SafeAreaView>

      {loading && articles.length === 0 ? (
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <NewsRowSkeleton key={i} scheme={scheme} />
          ))}
        </View>
      ) : error && articles.length === 0 ? (
        <View style={styles.center}>
          <Text style={[text.bodyMd, { color: c.textMuted, textAlign: "center" }]}>{error}</Text>
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
            <Text style={[text.bodyMd, { color: "#000", fontWeight: "700" }]}>Try again</Text>
          </Pressable>
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.center}>
          <Newspaper size={32} color={c.textMuted} strokeWidth={1.5} />
          <Text
            style={[
              text.bodyMd,
              { color: c.textMuted, textAlign: "center", marginTop: spacing.md },
            ]}
          >
            No articles right now. Check back later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(a) => a.id}
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
          renderItem={({ item, index }) =>
            index === 0 ? (
              <FeatureCard article={item} c={c} onPress={() => open(item.source_url)} />
            ) : (
              <ArticleRow article={item} c={c} onPress={() => open(item.source_url)} />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        />
      )}
    </View>
  );
}

function FeatureCard({
  article,
  c,
  onPress,
}: {
  article: NewsArticle;
  c: typeof colors.dark;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.featureCard,
        {
          backgroundColor: pressed ? c.surfaceHover : c.surfaceCard,
          borderColor: c.surfaceBorder,
        },
      ]}
    >
      {article.image_url ? (
        <Image
          source={{ uri: article.image_url }}
          style={styles.featureImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <View style={[styles.featureImg, { backgroundColor: c.surfaceHover }]} />
      )}
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {article.is_breaking && (
            <View style={[styles.breakingPill, { backgroundColor: c.accentRed }]}>
              <Text style={[text.labelXs, { color: "#fff", fontWeight: "900", letterSpacing: 0.6 }]}>
                BREAKING
              </Text>
            </View>
          )}
          <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", letterSpacing: 0.5 }]}>
            {article.source.toUpperCase()} · {relativeTime(article.published_at)}
          </Text>
        </View>
        <Text numberOfLines={3} style={[text.headingSm, { color: c.textPrimary, lineHeight: 26 }]}>
          {article.title}
        </Text>
        {!!article.summary && (
          <Text numberOfLines={2} style={[text.bodySm, { color: c.textSecondary, lineHeight: 20 }]}>
            {article.summary}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function ArticleRow({
  article,
  c,
  onPress,
}: {
  article: NewsArticle;
  c: typeof colors.dark;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.surfaceHover : c.surface, borderBottomColor: c.surfaceBorder },
      ]}
    >
      <View style={{ flex: 1, gap: 4, paddingRight: spacing.md }}>
        <Text style={[text.labelSm, { color: c.textMuted, fontWeight: "700", letterSpacing: 0.5 }]}>
          {article.source.toUpperCase()} · {relativeTime(article.published_at)}
        </Text>
        <Text numberOfLines={3} style={[text.bodyMd, { color: c.textPrimary, fontWeight: "700" }]}>
          {article.title}
        </Text>
      </View>
      {article.image_url ? (
        <Image
          source={{ uri: article.image_url }}
          style={styles.thumb}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <View style={[styles.thumb, { backgroundColor: c.surfaceHover }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  featureCard: {
    flexDirection: "column",
    alignItems: "stretch",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  featureImg: {
    alignSelf: "stretch",
    width: "100%",
    height: 220,
  },
  breakingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 88,
    height: 66,
    borderRadius: radii.sm,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
});
