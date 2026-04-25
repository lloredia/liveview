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

import { requestPasswordReset } from "@/src/api";
import { colors, radii, spacing, text } from "@/src/theme";

export default function ForgotPasswordScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      setError("Could not reach the server. Try again.");
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
          <Text style={[text.headingMd, { color: c.textPrimary, textAlign: "center" }]}>
            Reset your password
          </Text>

          {sent ? (
            <>
              <Text
                style={[
                  text.bodyMd,
                  {
                    color: c.textSecondary,
                    textAlign: "center",
                    marginTop: spacing.lg,
                  },
                ]}
              >
                If an account exists for {email}, we&apos;ve sent a password
                reset link. It expires in 1 hour.
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: c.accentGreen, marginTop: spacing.xl, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[text.bodyMd, { color: "#000", fontWeight: "700" }]}>
                    Back to sign in
                  </Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <>
              <Text
                style={[
                  text.bodyMd,
                  {
                    color: c.textSecondary,
                    textAlign: "center",
                    marginTop: spacing.sm,
                  },
                ]}
              >
                Enter your email and we&apos;ll send you a link to set a new
                password.
              </Text>

              <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={c.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  autoFocus
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
                  disabled={loading || !email.trim()}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: c.accentGreen,
                      opacity: pressed ? 0.85 : !email.trim() || loading ? 0.5 : 1,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={[text.bodyMd, { color: "#000", fontWeight: "700" }]}>
                      Send reset link
                    </Text>
                  )}
                </Pressable>
              </View>

              <Link href="/(auth)/login" asChild>
                <Pressable style={{ marginTop: spacing.xl, alignItems: "center" }}>
                  <Text style={[text.bodyMd, { color: c.accentGreen, fontWeight: "600" }]}>
                    Back to sign in
                  </Text>
                </Pressable>
              </Link>
            </>
          )}
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
