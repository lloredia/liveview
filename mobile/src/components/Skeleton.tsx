import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "../theme";

/**
 * Single shimmering placeholder block. Width can be a percentage or fixed.
 * Height defaults to 12 — useful for short label rows. Fade is opacity-only
 * (no LayoutAnimation) so it's safe to render dozens of these in a list.
 */
export function SkeletonBlock({
  width,
  height = 12,
  radius = 6,
  scheme = "dark",
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  scheme?: "dark" | "light";
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  const c = colors[scheme];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: c.surfaceCard,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Match-row skeleton: matches the real row's spacing so the swap is calm. */
export function MatchRowSkeleton({ scheme = "dark" }: { scheme?: "dark" | "light" }) {
  const c = colors[scheme];
  return (
    <View style={[styles.row, { borderBottomColor: c.surfaceBorder }]}>
      <View style={styles.side}>
        <SkeletonBlock width={28} height={28} radius={14} scheme={scheme} />
        <SkeletonBlock width={80} height={14} scheme={scheme} />
      </View>
      <SkeletonBlock width={20} height={24} scheme={scheme} />
      <SkeletonBlock width={56} height={16} scheme={scheme} />
      <SkeletonBlock width={20} height={24} scheme={scheme} />
      <View style={[styles.side, { justifyContent: "flex-end" }]}>
        <SkeletonBlock width={80} height={14} scheme={scheme} />
        <SkeletonBlock width={28} height={28} radius={14} scheme={scheme} />
      </View>
    </View>
  );
}

/**
 * Match detail skeleton — same shape as the real card so the swap to
 * loaded data doesn't shift any neighbour. Top bar, status row, hero,
 * broadcast strip, period table.
 */
export function MatchDetailSkeleton({ scheme = "dark" }: { scheme?: "dark" | "light" }) {
  const c = colors[scheme];
  return (
    <View style={[detailStyles.card, { borderColor: c.surfaceBorder }]}>
      <View style={detailStyles.topBar}>
        <SkeletonBlock width={64} height={26} radius={13} scheme={scheme} />
        <SkeletonBlock width={92} height={11} scheme={scheme} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <SkeletonBlock width={28} height={28} radius={14} scheme={scheme} />
          <SkeletonBlock width={28} height={28} radius={14} scheme={scheme} />
        </View>
      </View>

      <View style={detailStyles.statusRow}>
        <SkeletonBlock width={70} height={20} radius={10} scheme={scheme} />
        <SkeletonBlock width={80} height={12} scheme={scheme} />
      </View>

      <View style={detailStyles.hero}>
        <View style={detailStyles.heroSide}>
          <SkeletonBlock width={52} height={52} radius={26} scheme={scheme} />
          <SkeletonBlock width={48} height={12} scheme={scheme} />
          <SkeletonBlock width={80} height={9} scheme={scheme} />
        </View>
        <View style={{ alignItems: "center", gap: 6 }}>
          <SkeletonBlock width={120} height={36} scheme={scheme} />
        </View>
        <View style={detailStyles.heroSide}>
          <SkeletonBlock width={52} height={52} radius={26} scheme={scheme} />
          <SkeletonBlock width={48} height={12} scheme={scheme} />
          <SkeletonBlock width={80} height={9} scheme={scheme} />
        </View>
      </View>

      <View style={detailStyles.broadcastStrip}>
        <SkeletonBlock width="80%" height={9} scheme={scheme} />
      </View>

      <View style={detailStyles.tablePanel}>
        <SkeletonBlock width="100%" height={14} scheme={scheme} />
        <SkeletonBlock width="100%" height={14} scheme={scheme} />
        <SkeletonBlock width="100%" height={14} scheme={scheme} />
      </View>
    </View>
  );
}

/** News row skeleton: title block + thumbnail block. */
export function NewsRowSkeleton({ scheme = "dark" }: { scheme?: "dark" | "light" }) {
  const c = colors[scheme];
  return (
    <View style={[styles.newsRow, { borderBottomColor: c.surfaceBorder }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBlock width="40%" height={10} scheme={scheme} />
        <SkeletonBlock width="95%" height={16} scheme={scheme} />
        <SkeletonBlock width="70%" height={16} scheme={scheme} />
      </View>
      <SkeletonBlock width={88} height={66} radius={8} scheme={scheme} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: "#000",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 16,
    margin: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 6,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  heroSide: { flex: 1, alignItems: "center", gap: 8 },
  broadcastStrip: {
    alignItems: "center",
    marginBottom: 14,
  },
  tablePanel: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
});
