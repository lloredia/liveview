import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { ApiError } from "@/src/api";
import { colors, radii, spacing, text } from "@/src/theme";

export default function LoginScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? "Invalid email or password."
          : "Something went wrong. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { padding: spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", marginBottom: spacing["2xl"] }}>
            <Text style={[text.headingLg, { color: c.textPrimary }]}>
              LIVE
              <Text style={{ color: c.accentGreen }}>VIEW</Text>
            </Text>
          </View>

          <Text style={[text.headingMd, { color: c.textPrimary, textAlign: "center" }]}>
            Sign in to track games
          </Text>
          <Text
            style={[
              text.bodyMd,
              { color: c.textSecondary, textAlign: "center", marginTop: spacing.sm },
            ]}
          >
            Enter your email and password to continue.
          </Text>

          <View style={{ marginTop: spacing["2xl"], gap: spacing.md }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceCard,
                  borderColor: c.surfaceBorder,
                  color: c.textPrimary,
                },
              ]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoComplete="current-password"
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceCard,
                  borderColor: c.surfaceBorder,
                  color: c.textPrimary,
                },
              ]}
            />

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable style={{ alignSelf: "flex-end" }}>
                <Text style={[text.bodySm, { color: c.accentBlue }]}>
                  Forgot password?
                </Text>
              </Pressable>
            </Link>

            {error && (
              <Text style={[text.bodySm, { color: c.accentRed, textAlign: "center" }]}>
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.accentGreen, opacity: pressed ? 0.85 : loading ? 0.6 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={[text.bodyMd, { color: "#000", fontWeight: "700" }]}>
                  Continue with Email
                </Text>
              )}
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl, gap: spacing.sm, alignItems: "center" }}>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text style={[text.bodyMd, { color: c.accentGreen, fontWeight: "600" }]}>
                  Create account
                </Text>
              </Pressable>
            </Link>
            <Text style={[text.bodySm, { color: c.textMuted, textAlign: "center" }]}>
              Tracking and alerts require an account.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center" },
  input: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  primaryBtn: {
    height: 50,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
