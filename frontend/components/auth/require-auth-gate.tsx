"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface RequireAuthGateProps {
  children: ReactNode;
  /** When not authed, show this instead of the default locked UI */
  fallback?: ReactNode;
  /** Optional: redirect path after login (e.g. /match/123) */
  returnPath?: string;
}

/**
 * Renders children if the user is authenticated.
 * Otherwise renders the locked state UI (or fallback).
 */
export function RequireAuthGate({ children, fallback, returnPath }: RequireAuthGateProps) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
      </div>
    );
  }

  if (session?.user) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const loginUrl = returnPath
    ? `/login?callbackUrl=${encodeURIComponent(returnPath)}`
    : "/login";

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-glass-border bg-glass p-6 text-center"
      role="region"
      aria-label="Sign in to unlock"
    >
      <h3 className="text-heading-sm font-semibold text-text-primary">
        Create a free account to track games
      </h3>
      <p className="max-w-sm text-body-sm text-text-secondary">
        Tracking, favorites, and alerts are available after sign-in.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href={loginUrl}
          className="rounded-lg bg-accent-green px-4 py-2 text-label-md font-semibold text-black hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href={returnPath ? `/signup?callbackUrl=${encodeURIComponent(returnPath)}` : "/signup"}
          className="rounded-lg border border-glass-border bg-glass px-4 py-2 text-label-md font-medium text-text-primary hover:bg-glass-hover"
        >
          Create account
        </Link>
        <Link
          href={returnPath || "/"}
          className="rounded-lg px-4 py-2 text-label-md font-medium text-text-muted hover:text-text-secondary"
        >
          Not now
        </Link>
      </div>
    </div>
  );
}
