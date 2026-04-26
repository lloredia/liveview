import { Tabs } from "expo-router";
import { CircleDot, Newspaper, UserRound } from "lucide-react-native";
import { Platform, StyleSheet, useColorScheme } from "react-native";

import { colors } from "@/src/theme";

export default function TabsLayout() {
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const c = colors[scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentGreen,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.surfaceBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scoreboard",
          tabBarIcon: ({ color, focused }) => (
            <CircleDot size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: "News",
          tabBarIcon: ({ color, focused }) => (
            <Newspaper size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <UserRound size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tabs>
  );
}
