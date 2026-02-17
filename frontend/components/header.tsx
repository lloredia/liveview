"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "./auth-modal";
import { SettingsModal } from "./settings-modal";
import { Search } from "./search";
import { isSoundEnabled, setSoundEnabled } from "@/lib/notification-settings";
import { isPushSupported } from "@/lib/push-notifications";

interface HeaderProps {
  connected: boolean;
  onToggleSidebar: () => void;
  liveCount?: number;
  onLeagueSelect?: (leagueId: string) => void;
  onMatchSelect?: (matchId: string, leagueName?: string) => void;
  pushEnabled?: boolean;
  onPushToggle?: () => void;
}

export function Header({
  connected,
  onToggleSidebar,
  liveCount = 0,
  onLeagueSelect,
  onMatchSelect,
  pushEnabled = false,
  onPushToggle,
}: HeaderProps) {
  const { theme, mode, toggle: toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-surface-border bg-surface-raised/95 px-4 py-2.5 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={onToggleSidebar}
            className="rounded-lg p-1 text-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/logo.png"
              alt="LiveView"
              className="h-7 w-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-r from-accent-green to-accent-blue bg-clip-text text-lg font-black tracking-tight text-transparent">
                LIVEVIEW
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-text-dim sm:inline">
                Sports Tracker
              </span>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Search */}
          {onLeagueSelect && onMatchSelect && (
            <Search onLeagueSelect={onLeagueSelect} onMatchSelect={onMatchSelect} />
          )}

          {/* Live count */}
          {liveCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1">
              <div className="relative h-1.5 w-1.5">
                <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                <div className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
              </div>
              <span className="text-[11px] font-bold text-red-400">{liveCount}</span>
            </div>
          )}

          {/* Sound toggle */}
          <button
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setSoundEnabled(next);
            }}
            className="rounded-lg p-1.5 text-sm transition-colors hover:bg-surface-hover"
            title={soundOn ? "Mute notifications" : "Unmute notifications"}
          >
            {soundOn ? "🔔" : "🔕"}
          </button>

          {/* Push notification toggle */}
          {isPushSupported() && onPushToggle && (
            <button
              onClick={onPushToggle}
              className={`rounded-lg p-1.5 text-sm transition-colors hover:bg-surface-hover ${
                pushEnabled ? "text-accent-blue" : "text-text-muted"
              }`}
              title={pushEnabled ? "Push notifications on" : "Enable push notifications"}
            >
              {pushEnabled ? "🔵" : "⚪"}
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-sm transition-colors hover:bg-surface-hover"
            title={`Theme: ${mode} (click to cycle)`}
          >
            {mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "🌗"}
          </button>

          {/* User */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-accent-blue/10 px-2.5 py-1 text-[11px] font-semibold text-accent-blue transition-colors hover:bg-accent-blue/20"
              >
                <span className="h-4 w-4 rounded-full bg-accent-blue/30 text-center text-[10px] font-bold leading-4">
                  {user.username[0].toUpperCase()}
                </span>
                {user.username}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-44 animate-scale-in overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-xl">
                  <div className="border-b border-surface-border px-3.5 py-2.5">
                    <div className="text-[12px] font-medium text-text-primary">{user.username}</div>
                    <div className="text-[10px] text-text-muted">{user.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSettingsOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  >
                    ⚙ Settings
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12px] text-red-400 transition-colors hover:bg-surface-hover"
                  >
                    ↪ Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="rounded-full bg-accent-blue/10 px-3 py-1 text-[11px] font-semibold text-accent-blue transition-colors hover:bg-accent-blue/20"
            >
              Sign in
            </button>
          )}

          {/* Connection status */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
              connected ? "bg-accent-green/8" : "bg-accent-red/8"
            }`}
          >
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-accent-green" : "bg-accent-red"
              }`}
            />
            <span
              className={`text-[11px] font-semibold ${
                connected ? "text-accent-green" : "text-accent-red"
              }`}
            >
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}