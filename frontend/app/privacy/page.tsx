import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — LiveView",
  description: "LiveView privacy policy: web content, API usage, and data practices.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-8 text-text-primary">
      <div className="mx-auto max-w-prose">
        <Link
          href="/"
          className="mb-6 inline-block text-[13px] text-accent-blue hover:underline"
        >
          ← Back to LiveView
        </Link>
        <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
        <p className="mb-8 text-[13px] text-text-secondary">
          Last updated: February 2026
        </p>

        <div className="space-y-6 text-[14px] leading-relaxed text-text-primary">
          <section>
            <h2 className="mb-2 text-lg font-semibold">1. Overview</h2>
            <p className="text-text-secondary">
              LiveView (&quot;the app&quot;) is a sports score tracker that loads
              content from our web servers and uses our API to show live scores,
              schedules, and match details. This policy explains how we handle
              information in the app and on the web.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">2. Web content and API</h2>
            <p className="text-text-secondary">
              The app displays content delivered over HTTPS from our hosted
              frontend and fetches data from our backend API. We do not use
              third‑party analytics or advertising in the app. Network requests
              are limited to loading the app interface and sports data (scores,
              leagues, matches).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">3. Data we collect</h2>
            <p className="text-text-secondary">
              We do not collect personal data that identifies you. Preferences
              such as theme and pinned matches are stored locally on your device.
              If you use optional features (e.g. push notifications or account
              features in the future), we would only use the minimum data needed
              to provide those features and would describe it here or in the app.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">4. We do not sell your data</h2>
            <p className="text-text-secondary">
              We do not sell, rent, or share your data with third parties for
              advertising or marketing. We do not use the app for cross‑app or
              cross‑site tracking for ads.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">5. Contact</h2>
            <p className="text-text-secondary">
              For privacy questions or requests, use our{" "}
              <Link href="/support" className="text-accent-blue hover:underline">
                Support
              </Link>{" "}
              page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
