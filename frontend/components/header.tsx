"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Newspaper, User } from "lucide-react";
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

const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary glass-press";

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
      className="sticky top-0 z-50 flex h-11 items-center justify-between gap-2 px-3 md:px-4 bg-surface-raised/95 backdrop-blur-md border-b border-surface-border"
      style={{ position: "sticky", top: 0 }}
    >
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleSidebar}
          className={ICON_BUTTON}
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <Link
          href="/"
          className="relative flex items-center text-heading-sm tracking-tight text-text-primary hover:opacity-90 transition-opacity"
          aria-label="LiveView home"
        >
          LIVE<span className="text-accent-green">VIEW</span>
          {!connected && (
            <span
              className="ml-1.5 h-[6px] w-[6px] rounded-full bg-accent-red shadow-[0_0_6px_rgba(255,23,68,0.5)]"
              title="Offline"
              aria-label="Offline"
            />
          )}
        </Link>
      </div>

      <div className="flex items-center gap-0.5">
        <Link
          href="/news"
          aria-label="News"
          className={`${ICON_BUTTON} ${
            isNews ? "bg-accent-green/15 text-accent-green" : ""
          }`}
        >
          <Newspaper size={16} strokeWidth={2} />
        </Link>

        {onLeagueSelect && onMatchSelect && (
          <Search onLeagueSelect={onLeagueSelect} onMatchSelect={onMatchSelect} />
        )}

        <NotificationInbox />

        {status !== "loading" && (
          <Link
            href={session?.user ? "/account" : "/login"}
            aria-label={session?.user ? "Account" : "Sign in"}
            className={ICON_BUTTON}
          >
            <User size={16} strokeWidth={2} />
          </Link>
        )}

        <button
          onClick={toggle}
          className={ICON_BUTTON}
          aria-label={`Theme: ${mode}. Click to switch.`}
          title={`Theme: ${mode}`}
        >
          <ThemeIcon mode={mode} />
        </button>
      </div>
    </header>
  );
}
