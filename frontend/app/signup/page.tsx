"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AppleLogo } from "@/components/auth/AppleLogo";
import { GoogleLogo } from "@/components/auth/GoogleLogo";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function SignupContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const handleOAuth = (provider: "apple" | "google") => {
    setError("");
    signIn(provider, { callbackUrl, redirect: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/v1/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            name: name.trim() || undefined,
          }),
        });
      } catch (netErr) {
        setError("Could not reach server. Check your connection or try again later.");
        setLoading(false);
        return;
      }
      const raw = await res.text();
      const data = raw ? (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } })() : {};
      if (!res.ok) {
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? (detail as { msg?: string }[]).map((x) => x.msg ?? "").filter(Boolean).join(". ") || String(data.message ?? "Registration failed.")
              : String(data.message ?? "Registration failed.");
        setError(msg || "Registration failed.");
        setLoading(false);
        return;
      }
      const signInRes = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (signInRes?.url) {
        window.location.href = signInRes.url;
        return;
      }
      if (signInRes?.error) setError("Account created. Please sign in.");
      else router.push(callbackUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message.includes("fetch") || message.includes("Network") ? "Could not reach server. Check your connection or try again later." : message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-12">
      <div className="mx-auto max-w-sm">
        <Link href="/" className="mb-6 inline-block text-[13px] text-accent-blue hover:underline">
          ← Back to LiveView
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Create account</h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          Sign up with Google, Apple, or email to track games and get alerts.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.12] bg-white/[0.06] font-medium text-text-primary transition-colors hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 active:scale-[0.98]"
            aria-label="Continue with Apple"
          >
            <AppleLogo className="h-5 w-5 shrink-0 text-white" />
            Continue with Apple
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.12] bg-white/[0.06] font-medium text-text-primary transition-colors hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2 active:scale-[0.98]"
            aria-label="Continue with Google"
          >
            <GoogleLogo className="h-5 w-5 shrink-0" />
            Continue with Google
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.1]" />
          <span className="text-[12px] text-text-muted">or sign up with email</span>
          <div className="h-px flex-1 bg-white/[0.1]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-xl border border-glass-border bg-glass px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
            autoComplete="name"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-glass-border bg-glass px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-xl border border-glass-border bg-glass px-4 text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green/30"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && (
            <p className="text-[13px] text-accent-red" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-xl bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-text-muted">
          Already have an account?{" "}
          <Link href={`/login${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="text-accent-green hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[100dvh] items-center justify-center bg-surface"><div className="h-8 w-8 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" /></div>}>
      <SignupContent />
    </Suspense>
  );
}
