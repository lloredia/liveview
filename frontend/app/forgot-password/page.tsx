"use client";

import Link from "next/link";
import { SportsBackground } from "@/components/auth/SportsBackground";
import { VignetteOverlay } from "@/components/auth/VignetteOverlay";
import { GlassAuthCard } from "@/components/auth/GlassAuthCard";

export default function ForgotPasswordPage() {
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

        <h1 className="text-center text-xl font-semibold text-text-primary">
          Forgot password?
        </h1>

        <p className="mt-4 text-center text-[14px] text-text-secondary leading-relaxed">
          Password reset is not available yet. If you signed up with Apple or Google, use
          &quot;Continue with Apple&quot; or &quot;Continue with Google&quot; on the sign-in page.
          Otherwise, use the same email and password you used to create your account.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-[14px] bg-accent-green font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green focus-visible:outline-offset-2"
          >
            Back to sign in
          </Link>
        </div>
      </GlassAuthCard>
    </div>
  );
}
