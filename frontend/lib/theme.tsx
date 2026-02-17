"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
type ThemeMode = "dark" | "light" | "auto";

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  mode: "auto",
  toggle: () => {},
  setMode: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.className = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [theme, setTheme] = useState<Theme>("dark");

  // Load saved mode on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("lv_theme_mode") as ThemeMode | null;
      // Migration: check old key
      const savedTheme = localStorage.getItem("lv_theme") as Theme | null;

      if (savedMode === "dark" || savedMode === "light" || savedMode === "auto") {
        setModeState(savedMode);
        if (savedMode === "auto") {
          const sys = getSystemTheme();
          setTheme(sys);
          applyTheme(sys);
        } else {
          setTheme(savedMode);
          applyTheme(savedMode);
        }
      } else if (savedTheme === "light" || savedTheme === "dark") {
        // Migrate old setting
        setModeState(savedTheme);
        setTheme(savedTheme);
        applyTheme(savedTheme);
        localStorage.setItem("lv_theme_mode", savedTheme);
      } else {
        // Default: auto
        const sys = getSystemTheme();
        setTheme(sys);
        applyTheme(sys);
      }
    } catch {
      const sys = getSystemTheme();
      setTheme(sys);
      applyTheme(sys);
    }
  }, []);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (mode !== "auto") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? "light" : "dark";
      setTheme(newTheme);
      applyTheme(newTheme);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem("lv_theme_mode", newMode);
    } catch {}

    if (newMode === "auto") {
      const sys = getSystemTheme();
      setTheme(sys);
      applyTheme(sys);
    } else {
      setTheme(newMode);
      applyTheme(newMode);
    }
  }, []);

  // Toggle cycles: dark → light → auto → dark
  const toggle = useCallback(() => {
    const next = mode === "dark" ? "light" : mode === "light" ? "auto" : "dark";
    setMode(next);
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}