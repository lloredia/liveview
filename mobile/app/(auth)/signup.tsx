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

export default function SignupScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || undefined);
    } catch (e) {
      let msg = "Something went wrong. Try again.";
      if (e instanceof ApiError) {
        if (e.status === 400 && e.detail?.toLowerCase().includes("already"))
          msg = "An account with this email already exists.";
        else if (e.detail) msg = e.detail;
      }
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
            Create account
          </Text>
          <Text
            style={[
              text.bodyMd,
              { color: c.textSecondary, textAlign: "center", marginTop: spacing.sm },
            ]}
          >
            Sign up to track games and get alerts.
          </Text>

          <View style={{ marginTop: spacing["2xl"], gap: spacing.md }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor={c.textMuted}
              autoComplete="name"
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
              placeholder="Password (min 8 characters)"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoComplete="new-password"
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
                  Sign up
                </Text>
              )}
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl, gap: spacing.sm, alignItems: "center" }}>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={[text.bodyMd, { color: c.accentGreen, fontWeight: "600" }]}>
                  Already have an account? Sign in
                </Text>
              </Pressable>
            </Link>
            <Text
              style={[text.bodySm, { color: c.textMuted, textAlign: "center" }]}
            >
              By signing up you agree to our Privacy Policy.
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
