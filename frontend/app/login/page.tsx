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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/";
  const from = searchParams?.get("from") ?? undefined;
  const oauthError = searchParams?.get("error");

  // Build Google redirect URI hint for Configuration error (must match Google Cloud Console exactly)
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const googleCallbackUrl = origin ? `${origin}/api/auth/callback/google` : "";

  // Show OAuth error from NextAuth redirect (e.g. OAuthCallback, Configuration, etc.)
  const errorMessage =
    error ||
    (oauthError === "OAuthAccountNotLinked"
      ? "This email is already linked to another sign-in method. Try signing in with Email or the other provider."
      : oauthError === "OAuthCreateAccount" || oauthError === "OAuthCallback"
        ? "Sign-in failed. Try again or use Email to continue."
        : oauthError === "Configuration"
          ? googleCallbackUrl
            ? "Sign-in with Google/Apple failed. In Google Cloud Console, add this exact Authorized redirect URI: " + googleCallbackUrl
            : "Sign-in is not configured. Please use Email to sign in."
          : oauthError
            ? "Sign-in failed. Try again or use Email."
            : "");

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
            autoFocus={!oauthError}
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-[14px] border border-white/[0.12] bg-white/[0.04] pl-4 pr-12 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
              required
              autoComplete="current-password"
              aria-label="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c4.058 0 7.36-2.94 8.897-7.098a10.523 10.523 0 00-1.935-3.779 10.5 10.5 0 00-4.447-2.403 10.5 10.5 0 00-4.447 2.403z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2.25" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
          <div className="-mt-1 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-[13px] text-text-muted hover:text-accent-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 rounded-sm transition-colors"
            >
              Forgot password?
            </Link>
          </div>
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
