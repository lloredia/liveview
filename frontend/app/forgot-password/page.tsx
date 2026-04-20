"use client";

import Link from "next/link";
import { useState } from "react";
import { SportsBackground } from "@/components/auth/SportsBackground";
import { VignetteOverlay } from "@/components/auth/VignetteOverlay";
import { GlassAuthCard } from "@/components/auth/GlassAuthCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [debugUrl, setDebugUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/auth/password/request-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        debug_url?: string | null;
      };
      setSent(true);
      if (data.debug_url) setDebugUrl(data.debug_url);
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setLoading(false);
  };

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
          Reset your password
        </h1>

        {sent ? (
          <>
            <p className="mt-4 text-center text-body-sm text-text-secondary leading-relaxed md:text-body-md">
              If an account exists for <strong>{email}</strong>, we&apos;ve sent
              a password reset link. It expires in 1 hour.
            </p>
            {debugUrl && (
              <div className="mt-4 rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-3">
                <p className="text-label-md font-semibold text-accent-amber">
                  Dev mode link
                </p>
                <a
                  href={debugUrl}
                  className="mt-1 block break-all text-label-md text-accent-green hover:underline"
                >
                  {debugUrl}
                </a>
              </div>
            )}
            <Link
              href="/login"
              className="mt-8 flex h-12 items-center justify-center rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-center text-body-sm text-text-secondary leading-relaxed md:text-body-md">
              Enter the email for your account. We&apos;ll send you a link to set
              a new password.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
                required
                autoComplete="email"
                aria-label="Email address"
                autoFocus
              />
              {error && (
                <p className="text-body-sm text-accent-red md:text-body-md" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!email.trim() || loading}
                className="h-12 rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div className="mt-8 flex justify-center">
              <Link
                href="/login"
                className="text-body-sm font-medium text-accent-green hover:underline md:text-body-md"
              >
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </GlassAuthCard>
    </div>
  );
}
