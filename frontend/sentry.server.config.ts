import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side configuration for error tracking
 * Captures server-side errors, API errors, and middleware issues
 *
 * Environment variables required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN
 * - NEXT_PUBLIC_SENTRY_ENABLED: Set to "true" to enable
 */

const enabled =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  (process.env.NEXT_PUBLIC_SENTRY_ENABLED !== "false");

if (enabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === "production",

    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    debug: process.env.NODE_ENV !== "production",
  });
}

export { enabled };
