import AsyncStorage from "@react-native-async-storage/async-storage";

const FAVORITES_KEY = "lv.favorites.v1";
const THEME_KEY = "lv.theme.v1";

export type ThemePref = "system" | "light" | "dark";

export async function loadFavorites(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export async function saveFavorites(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export async function loadTheme(): Promise<ThemePref> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

export async function saveTheme(pref: ThemePref): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, pref);
  } catch {
    // ignore
  }
}
