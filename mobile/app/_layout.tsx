import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/src/auth-context";
import { registerForPushNotifications } from "@/src/notifications";
import { PreferencesProvider, usePreferences } from "@/src/preferences-context";

// Show banner + sound when a push arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootNav() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = (segments[0] as string | undefined) === "(auth)";
    if (status === "unauthenticated" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (status === "authenticated" && inAuthGroup) {
      router.replace("/");
    }
  }, [status, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

function ThemedShell() {
  const { scheme } = usePreferences();

  useEffect(() => {
    void registerForPushNotifications();
  }, []);

  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <RootNav />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <ThemedShell />
      </AuthProvider>
    </PreferencesProvider>
  );
}
