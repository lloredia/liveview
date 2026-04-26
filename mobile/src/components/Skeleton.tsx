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
