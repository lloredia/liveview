import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — LiveView",
  description: "Contact and support for LiveView sports tracker.",
};

export default function SupportPage() {
  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-8 text-text-primary">
      <div className="mx-auto max-w-prose">
        <Link
          href="/"
          className="mb-6 inline-block text-[13px] text-accent-blue hover:underline"
        >
          ← Back to LiveView
        </Link>
        <h1 className="mb-2 text-2xl font-bold">Support</h1>
        <p className="mb-8 text-[13px] text-text-secondary">
          Get help or get in touch with the LiveView team.
        </p>

        <div className="space-y-6 text-[14px] leading-relaxed text-text-primary">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Contact</h2>
            <p className="text-text-secondary">
              For app support, feedback, or privacy requests, email us at:
            </p>
            <p className="mt-2">
              <a
                href="mailto:support@liveview-tracker.com"
                className="text-accent-blue hover:underline"
              >
                support@liveview.app
              </a>
            </p>
           </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Privacy &amp; terms</h2>
            <p className="text-text-secondary">
              <Link href="/privacy" className="text-accent-blue hover:underline">
                Privacy Policy
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
