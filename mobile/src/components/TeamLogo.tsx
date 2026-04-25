import { Image, type ImageStyle } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, type ColorTokens } from "../theme";

interface TeamLogoProps {
  url: string | null | undefined;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Color scheme to use for the initials fallback. Defaults to dark. */
  scheme?: "dark" | "light";
}

/**
 * Cached team crest. Falls back to circular initials when no URL is
 * provided or the image fails to load. Uses expo-image so multiple
 * scoreboard scrolls don't refetch the same crest.
 */
export function TeamLogo({
  url,
  name,
  size = 24,
  style,
  scheme = "dark",
}: TeamLogoProps) {
  const c: ColorTokens = colors[scheme];
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  const showImage = !!url && !failed;

  if (showImage) {
    return (
      <View
        style={[
          styles.box,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: c.surfaceCard,
          },
          style,
        ]}
      >
        <Image
          source={{ uri: url }}
          style={imageStyle(size, radius)}
          contentFit="contain"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  // Fallback: 1–3 char initials in a tinted circle
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: c.surfaceHover,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: c.textTertiary,
          fontWeight: "800",
          fontSize: Math.max(8, size * 0.34),
          letterSpacing: -0.3,
        }}
      >
        {initials || "—"}
      </Text>
    </View>
  );
}

function imageStyle(size: number, radius: number): ImageStyle {
  return {
    width: size,
    height: size,
    borderRadius: radius,
  };
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
