import { Tabs } from "expo-router";
import { useColorScheme, View, Text } from "react-native";

import { colors } from "@/src/theme";

interface TabBarIconProps {
  symbol: string;
  color: string;
}

function TabBarIcon({ symbol, color }: TabBarIconProps) {
  return (
    <View style={{ width: 24, alignItems: "center" }}>
      <Text style={{ color, fontSize: 18, fontWeight: "700" }}>{symbol}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = colors[scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentGreen,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: {
          backgroundColor: c.surfaceRaised,
          borderTopColor: c.surfaceBorder,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scoreboard",
          tabBarIcon: ({ color }) => <TabBarIcon symbol="●" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <TabBarIcon symbol="◉" color={color} />,
        }}
      />
    </Tabs>
  );
}
