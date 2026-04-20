"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SportsBackground } from "@/components/auth/SportsBackground";
import { VignetteOverlay } from "@/components/auth/VignetteOverlay";
import { GlassAuthCard } from "@/components/auth/GlassAuthCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/auth/password/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(data.detail || "Invalid or expired reset link.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setLoading(false);
  };

  const missingToken = !token;

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#08080e] px-4 py-12">
      <SportsBackground />
      <VignetteOverlay />

      <Link
        href="/login"
        className="text-body-sm text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 rounded-sm absolute left-4 top-6 z-10 transition-colors"
        aria-label="Back to sign in"
      >
        ← Back to sign in
      </Link>

      <GlassAuthCard className="z-10 mx-auto">
        <div className="mb-8 flex justify-center">
          <span className="text-[1.75rem] font-bold tracking-tight text-text-primary">
            LIVE<span className="text-accent-green">VIEW</span>
          </span>
        </div>

        <h1 className="text-center text-xl font-semibold text-text-primary md:text-2xl">
          Set a new password
        </h1>

        {done ? (
          <>
            <p className="mt-4 text-center text-body-sm text-text-secondary md:text-body-md">
              Your password has been updated. Sign in with your new password.
            </p>
            <Link
              href="/login"
              className="mt-8 flex h-12 items-center justify-center rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          </>
        ) : missingToken ? (
          <>
            <p className="mt-4 text-center text-body-sm text-accent-red md:text-body-md">
              This link is missing its reset token. Request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="mt-8 flex h-12 items-center justify-center rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-[14px] border border-white/[0.12] bg-white/[0.04] pl-4 pr-12 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
                required
                minLength={8}
                autoComplete="new-password"
                aria-label="New password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-text-muted hover:text-text-primary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
              required
              minLength={8}
              autoComplete="new-password"
              aria-label="Confirm new password"
            />
            {error && (
              <p className="text-body-sm text-accent-red md:text-body-md" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </GlassAuthCard>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#08080e]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-green" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
