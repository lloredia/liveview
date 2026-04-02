"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search } from "./search";
import { useTheme } from "@/lib/theme";
import { NotificationInbox } from "./notification-inbox";

interface HeaderProps {
  connected: boolean;
  onToggleSidebar: () => void;
  liveCount?: number;
  onLeagueSelect?: (leagueId: string) => void;
  onMatchSelect?: (matchId: string, leagueName?: string) => void;
}

function ThemeIcon({ mode }: { mode: "dark" | "light" | "auto" }) {
  if (mode === "light")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    );
  if (mode === "dark")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      <path d="M16 12a4 4 0 0 1-4 4V8a4 4 0 0 1 4 4z" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function Header({
  connected,
  onToggleSidebar,
  onLeagueSelect,
  onMatchSelect,
}: HeaderProps) {
  const { mode, toggle } = useTheme();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isNews = pathname === "/news";

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 flex h-[44px] items-center justify-between px-3 md:px-4 bg-surface-raised/95 backdrop-blur-md border-b border-surface-border"
      style={{ position: "sticky", top: 0 }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary glass-press"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <Link
          href="/"
          className="text-heading-sm tracking-tight text-text-primary hover:opacity-90 transition-opacity"
        >
          LIVE<span className="text-accent-green">VIEW</span>
        </Link>

        <Link
          href="/news"
          className={`ml-2 rounded-[10px] px-2.5 py-1.5 text-body-sm font-semibold transition-all duration-150 glass-press ${
            isNews
              ? "bg-accent-green/15 text-accent-green border border-accent-green/20"
              : "text-text-muted hover:bg-glass-hover hover:text-text-primary"
          }`}
        >
          News
        </Link>
      </div>

      <div className="flex items-center gap-1.5">
        {onLeagueSelect && onMatchSelect && (
          <Search onLeagueSelect={onLeagueSelect} onMatchSelect={onMatchSelect} />
        )}

        <NotificationInbox />

        {status !== "loading" && (
          <Link
            href={session?.user ? "/account" : "/login"}
            className="rounded-[10px] px-2.5 py-1.5 text-body-sm font-medium text-text-muted hover:bg-glass-hover hover:text-text-primary"
          >
            {session?.user ? "Account" : "Sign in"}
          </Link>
        )}

        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-text-muted transition-colors glass-press hover:bg-glass-hover hover:text-text-primary"
          aria-label={`Theme: ${mode}. Click to switch.`}
          title={`Theme: ${mode}`}
        >
          <ThemeIcon mode={mode} />
        </button>

        <div
          className={`h-[6px] w-[6px] rounded-full transition-colors ${
            connected ? "bg-accent-green shadow-[0_0_6px_rgba(0,230,118,0.4)]" : "bg-accent-red shadow-[0_0_6px_rgba(255,23,68,0.4)]"
          }`}
          title={connected ? "Connected" : "Offline"}
        />
      </div>
    </header>
  );
}
