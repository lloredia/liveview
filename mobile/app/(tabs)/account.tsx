import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { ApiError, deleteAccount } from "@/src/api";
import { colors, radii, spacing, text } from "@/src/theme";

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: c.surfaceCard, borderColor: c.surfaceBorder },
      ]}
    >
      <Text
        style={[
          text.labelMd,
          {
            color: c.textTertiary,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            marginBottom: spacing.md,
          },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function AccountScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];
  const { user, signOut } = useAuth();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const initials = (user?.name || user?.email || "LV")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
    } catch (e) {
      const msg =
        e instanceof ApiError && e.detail
          ? e.detail
          : "We couldn't delete your account right now. Please try again or contact support@liveview-tracker.com.";
      setDeleteError(msg);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[text.headingLg, { color: c.textPrimary }]}>Account</Text>

        {/* Profile */}
        <Section title="Profile">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: c.accentGreen + "33" },
              ]}
            >
              <Text style={[text.bodyMd, { color: c.accentGreen, fontWeight: "800" }]}>
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {user?.name && (
                <Text style={[text.bodyMd, { color: c.textPrimary, fontWeight: "700" }]}>
                  {user.name}
                </Text>
              )}
              <Text style={[text.bodySm, { color: c.textMuted }]}>
                {user?.email}
              </Text>
            </View>
          </View>
        </Section>

        {/* Sign out */}
        <Pressable
          onPress={() => {
            Alert.alert("Sign out?", "You'll need to sign in again to see tracked games.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => signOut() },
            ]);
          }}
          style={({ pressed }) => [
            styles.signOutBtn,
            {
              backgroundColor: c.surfaceCard,
              borderColor: c.surfaceBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[text.bodyMd, { color: c.textPrimary, fontWeight: "700" }]}>
            Sign out
          </Text>
        </Pressable>

        {/* Delete account — Apple 5.1.1(v) requires this be prominent */}
        <Section title="Delete account">
          <Text style={[text.bodySm, { color: c.textSecondary, marginBottom: spacing.md }]}>
            Permanently removes your account and all associated data from
            our servers — favorites, tracked matches, and saved articles.
            This cannot be undone.
          </Text>
          <Pressable
            onPress={() => {
              setDeleteError(null);
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
            style={({ pressed }) => [
              styles.dangerBtn,
              { backgroundColor: c.accentRed, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[text.bodyMd, { color: "#fff", fontWeight: "800" }]}>
              Delete my account
            </Text>
          </Pressable>
        </Section>
      </ScrollView>

      {/* Confirmation modal */}
      <Modal
        animationType="fade"
        transparent
        visible={deleteOpen}
        onRequestClose={() => !deleting && setDeleteOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: c.surfaceCard, borderColor: c.accentRed + "55" },
            ]}
          >
            <Text style={[text.headingSm, { color: c.accentRed }]}>
              Delete your account?
            </Text>
            <Text
              style={[text.bodySm, { color: c.textSecondary, marginTop: spacing.sm }]}
            >
              This permanently deletes your account and all data on our
              servers. You&apos;ll be signed out. This cannot be undone.
            </Text>
            <Text
              style={[text.bodySm, { color: c.textSecondary, marginTop: spacing.lg }]}
            >
              Type <Text style={{ fontWeight: "800", color: c.textPrimary }}>DELETE</Text>{" "}
              to confirm.
            </Text>
            <TextInput
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              placeholder="DELETE"
              placeholderTextColor={c.textMuted}
              autoCapitalize="characters"
              autoFocus
              style={[
                styles.input,
                {
                  backgroundColor: c.surface,
                  borderColor: c.surfaceBorder,
                  color: c.textPrimary,
                  marginTop: spacing.sm,
                },
              ]}
            />
            {deleteError && (
              <Text
                style={[
                  text.bodySm,
                  { color: c.accentRed, marginTop: spacing.md, textAlign: "center" },
                ]}
              >
                {deleteError}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => setDeleteOpen(false)}
                disabled={deleting}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: c.surfaceHover,
                    borderColor: c.surfaceBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[text.bodyMd, { color: c.textPrimary, fontWeight: "700" }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleteConfirm !== "DELETE" || deleting}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: c.accentRed,
                    opacity:
                      pressed ? 0.85 : deleteConfirm !== "DELETE" || deleting ? 0.4 : 1,
                  },
                ]}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[text.bodyMd, { color: "#fff", fontWeight: "800" }]}>
                    Delete forever
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutBtn: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtn: {
    height: 50,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  input: {
    height: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: "Menlo",
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
