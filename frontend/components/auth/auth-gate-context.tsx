"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { AppleLogo } from "@/components/auth/AppleLogo";
import { GoogleLogo } from "@/components/auth/GoogleLogo";

interface GateState {
  open: boolean;
  returnPath?: string;
}

const defaultState: GateState = { open: false };

const AuthGateContext = createContext<{
  openGate: (returnPath?: string) => void;
  closeGate: () => void;
  gateState: GateState;
}>({
  openGate: () => {},
  closeGate: () => {},
  gateState: defaultState,
});

export function useAuthGate() {
  return useContext(AuthGateContext);
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const [gateState, setGateState] = useState<GateState>(defaultState);

  const openGate = useCallback((returnPath?: string) => {
    setGateState({ open: true, returnPath: returnPath ?? typeof window !== "undefined" ? window.location.pathname + window.location.search : "/" });
  }, []);

  const closeGate = useCallback(() => {
    setGateState((s) => ({ ...s, open: false }));
  }, []);

  const loginUrl = gateState.returnPath
    ? `/login?callbackUrl=${encodeURIComponent(gateState.returnPath)}`
    : "/login";

  return (
    <AuthGateContext.Provider value={{ openGate, closeGate, gateState }}>
      {children}
      {gateState.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-gate-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-glass-border bg-surface p-6 shadow-xl">
            <h2 id="auth-gate-title" className="text-lg font-semibold text-text-primary">
              Create a free account to track games
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Tracking, favorites, and alerts are available after sign-in.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => signIn("apple", { callbackUrl: gateState.returnPath || "/" })}
                className="flex items-center justify-center gap-2 rounded-xl border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-glass-hover"
              >
                <AppleLogo className="h-4 w-4 shrink-0 text-white" />
                Continue with Apple
              </button>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: gateState.returnPath || "/" })}
                className="flex items-center justify-center gap-2 rounded-xl border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-glass-hover"
              >
                <GoogleLogo className="h-4 w-4 shrink-0" />
                Continue with Google
              </button>
              <Link
                href={loginUrl}
                className="rounded-xl border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-glass-hover"
              >
                Email
              </Link>
              <button
                type="button"
                onClick={closeGate}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-secondary"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGateContext.Provider>
  );
}
