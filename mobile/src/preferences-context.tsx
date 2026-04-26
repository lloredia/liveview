import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import {
  loadFavorites,
  loadTheme,
  saveFavorites,
  saveTheme,
  type ThemePref,
} from "./preferences";

interface Ctx {
  favorites: Set<string>;
  isFavorite: (teamId: string) => boolean;
  toggleFavorite: (teamId: string) => void;
  theme: ThemePref;
  setTheme: (pref: ThemePref) => void;
  /** Resolved scheme: respects user preference, falls back to system. */
  scheme: "dark" | "light";
}

const PreferencesContext = createContext<Ctx | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [theme, setThemeState] = useState<ThemePref>("system");
  const system = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    loadFavorites().then((s) => {
      if (!cancelled) setFavorites(s);
    });
    loadTheme().then((t) => {
      if (!cancelled) setThemeState(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback((teamId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      void saveFavorites(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((pref: ThemePref) => {
    void Haptics.selectionAsync();
    setThemeState(pref);
    void saveTheme(pref);
  }, []);

  const isFavorite = useCallback((teamId: string) => favorites.has(teamId), [favorites]);

  const scheme: "dark" | "light" =
    theme === "system" ? (system === "light" ? "light" : "dark") : theme;

  const value = useMemo<Ctx>(
    () => ({ favorites, isFavorite, toggleFavorite, theme, setTheme, scheme }),
    [favorites, isFavorite, toggleFavorite, theme, setTheme, scheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Ctx {
  const v = useContext(PreferencesContext);
  if (!v) throw new Error("usePreferences must be used within PreferencesProvider");
  return v;
}
