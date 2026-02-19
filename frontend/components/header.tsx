"use client";

import { useState } from "react";
import { Search } from "./search";

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
  onLeagueSelect,
  onMatchSelect,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 flex h-[44px] items-center justify-between border-b border-surface-border bg-surface-raised px-3 md:px-4">
      {/* Left: hamburger + logo */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <span className="text-[15px] font-black tracking-tight text-text-primary">
          LIVE<span className="text-accent-green">VIEW</span>
        </span>
      </div>

      {/* Right: search + connection */}
      <div className="flex items-center gap-2">
        {onLeagueSelect && onMatchSelect && (
          <Search onLeagueSelect={onLeagueSelect} onMatchSelect={onMatchSelect} />
        )}

        <div
          className={`h-[6px] w-[6px] rounded-full ${
            connected ? "bg-accent-green" : "bg-accent-red"
          }`}
          title={connected ? "Connected" : "Offline"}
        />
      </div>
    </header>
  );
}
