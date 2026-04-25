import { ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { colors, spacing, text } from "@/src/theme";

export default function HomeScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const { user } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={[text.headingLg, { color: c.textPrimary }]}>
          LIVE
          <Text style={{ color: c.accentGreen }}>VIEW</Text>
        </Text>
        <Text style={[text.bodyMd, { color: c.textSecondary, marginTop: spacing.sm }]}>
          Welcome{user?.name ? `, ${user.name}` : ""}.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surfaceCard,
              borderColor: c.surfaceBorder,
              marginTop: spacing.xl,
            },
          ]}
        >
          <Text style={[text.headingSm, { color: c.textPrimary }]}>
            Today&apos;s scoreboard
          </Text>
          <Text style={[text.bodySm, { color: c.textMuted, marginTop: spacing.sm }]}>
            Live matches, scores, and play-by-play arrive in the next milestone.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
});
