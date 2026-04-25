import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, useColorScheme, View } from "react-native";

import { colors, spacing } from "@/src/theme";

interface TabBarIconProps {
  symbol: string;
  color: string;
  focused: boolean;
}

function TabBarIcon({ symbol, color, focused }: TabBarIconProps) {
  return (
    <View style={styles.iconWrap}>
      <Text
        style={{
          color,
          fontSize: focused ? 22 : 20,
          fontWeight: focused ? "900" : "700",
          lineHeight: 22,
        }}
      >
        {symbol}
      </Text>
    </View>
  );
}

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
            <TabBarIcon symbol="◉" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon symbol="◐" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 24,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
