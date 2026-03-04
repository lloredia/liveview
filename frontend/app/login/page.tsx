"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SportsBackground } from "@/components/auth/SportsBackground";
import { VignetteOverlay } from "@/components/auth/VignetteOverlay";
import { GlassAuthCard } from "@/components/auth/GlassAuthCard";
import { AppleLogo } from "@/components/auth/AppleLogo";
import { GoogleLogo } from "@/components/auth/GoogleLogo";
import { AUTH_GLASS } from "@/lib/ui/glass";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  // Show OAuth error from NextAuth redirect (e.g. OAuthCallback, Configuration, etc.)
  const errorMessage =
    error ||
    (oauthError === "OAuthAccountNotLinked"
      ? "This email is already linked to another sign-in method. Try signing in with Email or the other provider."
      : oauthError === "OAuthCreateAccount" || oauthError === "OAuthCallback"
        ? "Sign-in failed. Try again or use Email to continue."
        : oauthError === "Configuration"
          ? "Sign-in is not configured. Please use Email to sign in."
          : oauthError
            ? "Sign-in failed. Try again or use Email."
            : "");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const from = searchParams.get("from") ?? undefined;
  const oauthError = searchParams.get("error");

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      if (res?.url) window.location.href = res.url;
    } catch {
      setError("Something went wrong.");
    }
    setLoading(false);
  };

  const handleOAuth = (provider: "apple" | "google") => {
    setError("");
    signIn(provider, { callbackUrl, redirect: true });
  };

  const signupUrl = `/signup${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`;
  const backHref = from || "/";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#08080e] px-4 py-12">
      <SportsBackground />
      <VignetteOverlay />

      {/* Back link — above card, high contrast */}
      <Link
        href={backHref}
        className="text-body-sm text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 rounded-sm absolute left-4 top-6 z-10 transition-colors"
        aria-label="Back to LiveView"
      >
        ← Back to LiveView
      </Link>

      <GlassAuthCard className="z-10 mx-auto">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <span className="text-[1.75rem] font-bold tracking-tight text-text-primary">
            LIVE<span className="text-accent-green">VIEW</span>
          </span>
        </div>

        <h1 className="text-center text-xl font-semibold text-text-primary">
          Sign in to track games
        </h1>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.12] bg-white/[0.06] font-medium text-text-primary transition-colors hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 active:scale-[0.98] ${AUTH_GLASS.buttonRadius}`}
            aria-label="Continue with Apple"
          >
            <AppleLogo className="h-5 w-5 shrink-0 text-white" />
            Continue with Apple
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.12] bg-white/[0.06] font-medium text-text-primary transition-colors hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 active:scale-[0.98] ${AUTH_GLASS.buttonRadius}`}
            aria-label="Continue with Google"
          >
            <GoogleLogo className="h-5 w-5 shrink-0" />
            Continue with Google
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.1]" />
          <span className="text-[12px] text-text-muted">or</span>
          <div className="h-px flex-1 bg-white/[0.1]" />
        </div>

        <form onSubmit={handleCredentials} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
            required
            autoComplete="email"
            aria-label="Email address"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
            required
            autoComplete="current-password"
            aria-label="Password"
          />
          {errorMessage && (
            <p className="text-[13px] text-accent-red" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label={loading ? "Signing in" : "Continue with Email"}
          >
            {loading ? "Signing in…" : "Continue with Email"}
          </button>
        </form>

        {/* Secondary links */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <Link
            href={signupUrl}
            className="text-[13px] font-medium text-accent-green hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-2 rounded-sm"
          >
            Create account
          </Link>
          <Link
            href={backHref}
            className="text-[13px] text-text-muted hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 rounded-sm"
          >
            Continue without tracking
          </Link>
        </div>

        <p className="mt-6 text-center text-[11px] text-text-muted leading-relaxed">
          Tracking and alerts require an account.
        </p>
      </GlassAuthCard>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#08080e]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-green" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
