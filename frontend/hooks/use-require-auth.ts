"use client";

import { useSession } from "next-auth/react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/components/auth/auth-gate-context";

export interface UseRequireAuthOptions {
  /** Called when user is already authenticated (e.g. proceed with track action) */
  onAuthed?: () => void;
  /** Return path after login (e.g. current match page) */
  returnPath?: string;
}

export interface UseRequireAuthReturn {
  /** True if user is authenticated */
  isAuthed: boolean;
  /** True while session is loading */
  isLoading: boolean;
  /** Call before performing a tracking action. If authed: call onAuthed(). If not: open gate modal (Not now closes modal). */
  requireAuth: (opts?: { onAuthed?: () => void; returnPath?: string }) => void;
  /** Open login page with optional return path */
  openLogin: (returnPath?: string) => void;
}

/**
 * Hook to gate tracking actions behind authentication.
 * - If authed: call onAuthed (e.g. toggle track, add favorite).
 * - If not authed: open the auth gate modal (Apple | Google | Email | Not now). Not now closes modal; others go to sign-in.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthReturn {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { openGate } = useAuthGate();

  const isAuthed = !!session?.user;
  const isLoading = status === "loading";

  const requireAuth = useCallback(
    (opts?: { onAuthed?: () => void; returnPath?: string }) => {
      const onAuthed = opts?.onAuthed ?? options.onAuthed;
      const returnPath = opts?.returnPath ?? options.returnPath ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
      if (session?.user) {
        onAuthed?.();
        return;
      }
      openGate(returnPath);
    },
    [session?.user, options.onAuthed, options.returnPath, openGate]
  );

  const openLogin = useCallback(
    (returnPath?: string) => {
      const path = returnPath ?? options.returnPath ?? "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(path)}`);
    },
    [options.returnPath, router]
  );

  return { isAuthed, isLoading, requireAuth, openLogin };
}
