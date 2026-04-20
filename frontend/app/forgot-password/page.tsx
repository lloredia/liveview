"use client";

import Link from "next/link";
import { useState } from "react";
import { SportsBackground } from "@/components/auth/SportsBackground";
import { VignetteOverlay } from "@/components/auth/VignetteOverlay";
import { GlassAuthCard } from "@/components/auth/GlassAuthCard";

const SUPPORT_EMAIL = "support@liveview-tracker.com";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const mailtoHref = (() => {
    const subject = encodeURIComponent("Password reset — LiveView");
    const body = encodeURIComponent(
      [
        "Hi LiveView team,",
        "",
        `I need to reset the password for my account: ${email || "[your email]"}`,
        "",
        "Thanks.",
      ].join("\n"),
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  })();

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

        <p className="mt-3 text-center text-body-sm text-text-secondary leading-relaxed md:text-body-md">
          Enter the email associated with your account and we&apos;ll help
          you recover access.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = mailtoHref;
          }}
          className="mt-8 flex flex-col gap-3"
        >
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
          <button
            type="submit"
            disabled={!email.trim()}
            className="h-12 rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40"
          >
            Email support
          </button>
        </form>

        <p className="mt-6 text-center text-label-md text-text-muted leading-relaxed md:text-body-sm">
          We&apos;ll reply within 1 business day. You can also reach us directly at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-accent-green hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            href="/login"
            className="text-body-sm font-medium text-accent-green hover:underline md:text-body-md"
          >
            Back to sign in
          </Link>
        </div>
      </GlassAuthCard>
    </div>
  );
}
