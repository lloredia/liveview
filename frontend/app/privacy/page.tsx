import type { Metadata } from "next";
import Link from "next/link";
import { ProviderAttribution } from "@/components/provider-attribution";

export const metadata: Metadata = {
  title: "Privacy Policy — LiveView",
  description: "How LiveView handles your data",
};

function getLastUpdated(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function PrivacyPage() {
  const lastUpdated = getLastUpdated();

  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-8 text-text-primary">
      <article className="mx-auto max-w-prose">
        <Link
          href="/"
          className="mb-6 inline-block text-[13px] text-accent-blue hover:underline focus:outline focus:outline-2 focus:outline-accent-blue focus:outline-offset-2 rounded-sm"
        >
          ← Back to LiveView
        </Link>
        <header className="mb-8">
          <h1 className="mb-2 text-2xl font-bold text-text-primary">Privacy Policy</h1>
          <p className="text-[13px] text-text-secondary">
            Last updated: {lastUpdated}
          </p>
        </header>

        <div className="space-y-8 text-[14px] leading-relaxed text-text-primary">
          <section aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Overview
            </h2>
            <p className="text-text-secondary">
              LiveView (&quot;we&quot;, &quot;the app&quot;) is a sports score tracker. Login is optional.
              Browsing scores, news, and match details does not require an account. Tracking games,
              favorites, and push notifications are available only when you sign in (Apple, Google,
              or email). This policy describes what data we collect and how we use it.
            </p>
          </section>

          <section aria-labelledby="data-we-collect-heading">
            <h2 id="data-we-collect-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Data We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-text-secondary">
              <li>
                <strong className="text-text-primary">Account data:</strong> If you create an account,
                we store email, name (if you provide it), and auth provider identifiers (e.g. Apple or
                Google account linkage) so we can recognize you and provide tracking and notification
                features.
              </li>
              <li>
                <strong className="text-text-primary">Tracking data:</strong> When you are signed in, we
                store which games you track, your favorite teams and leagues, and your notification
                preferences. This data is tied to your account and is used only to deliver app
                functionality (e.g. push alerts for tracked games).
              </li>
              <li>
                <strong className="text-text-primary">Push notification tokens (APNs):</strong> On iOS,
                if you enable push notifications, we store the device push token (APNs token) so we can
                send you game alerts (e.g. score changes, game start, final score). We do not use push
                for marketing or third-party messaging.
              </li>
              <li>
                <strong className="text-text-primary">Device identifier:</strong> We may store a
                device identifier (e.g. for linking push tokens and session continuity). This is used
                only for app operations, not for cross-app or advertising tracking.
              </li>
              <li>
                <strong className="text-text-primary">Technical information:</strong> Our servers may
                log basic technical data such as IP address and user-agent for security, debugging,
                and operational purposes. We do not use this for profiling or advertising.
              </li>
            </ul>
          </section>

          <section aria-labelledby="how-we-use-heading">
            <h2 id="how-we-use-heading" className="mb-2 text-lg font-semibold text-text-primary">
              How We Use Data
            </h2>
            <p className="text-text-secondary">
              We use the data described above only to operate the app: to authenticate you, store your
              tracked games and favorites, send you push notifications you have opted into, and improve
              reliability and security. We do not use your data for advertising, and we do not share
              it with third parties for marketing or analytics.
            </p>
          </section>

          <section aria-labelledby="sharing-heading">
            <h2 id="sharing-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Sharing
            </h2>
            <p className="text-text-secondary">
              We do not sell, rent, or share your personal data with third parties for advertising or
              marketing. We do not use third-party tracking or analytics for ads. We do not run ads in
              the app. Data may be processed by our own infrastructure (e.g. hosting and push delivery
              services) only as needed to provide LiveView. We may disclose data if required by law or
              to protect our rights and safety.
            </p>
          </section>

          <section aria-labelledby="retention-heading">
            <h2 id="retention-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Data Retention
            </h2>
            <p className="text-text-secondary">
              We retain your account and tracking data while your account is active. You can request
              deletion of your account and associated data at any time by contacting us at
              support@liveview-tracker.com. After deletion, we will remove your data from our systems
              within a reasonable period, except where we must retain it for legal or safety reasons.
            </p>
          </section>

          <section aria-labelledby="your-choices-heading">
            <h2 id="your-choices-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Your Choices
            </h2>
            <p className="text-text-secondary">
              You can disable push notifications in your device settings. You can stop tracking games
              or remove favorites at any time in the app. You can sign out or request account and data
              deletion by contacting us at support@liveview-tracker.com.
            </p>
          </section>

          <section aria-labelledby="security-heading">
            <h2 id="security-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Security
            </h2>
            <p className="text-text-secondary">
              We use reasonable technical and organizational measures to protect your data, including
              secure transmission (HTTPS), secure storage of credentials, and access controls. No
              method of transmission or storage is 100% secure; we encourage you to use a strong
              password and keep your account credentials private.
            </p>
          </section>

          <section aria-labelledby="children-heading">
            <h2 id="children-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Children&apos;s Privacy
            </h2>
            <p className="text-text-secondary">
              LiveView is not directed at children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected such information,
              please contact us and we will take steps to delete it.
            </p>
          </section>

          <section aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="mb-2 text-lg font-semibold text-text-primary">
              Contact
            </h2>
            <p className="text-text-secondary">
              For privacy questions, data requests, or account deletion, contact us at{" "}
              <a
                href="mailto:support@liveview-tracker.com"
                className="text-accent-blue hover:underline focus:outline focus:outline-2 focus:outline-accent-blue focus:outline-offset-2 rounded-sm"
              >
                support@liveview-tracker.com
              </a>
              . You can also use our{" "}
              <Link href="/support" className="text-accent-blue hover:underline focus:outline focus:outline-2 focus:outline-accent-blue focus:outline-offset-2 rounded-sm">
                Support
              </Link>{" "}
              page.
            </p>
          </section>
        </div>

        <footer className="mt-10 border-t border-surface-border pt-6 text-center">
          <ProviderAttribution />
        </footer>
      </article>
    </div>
  );
}
