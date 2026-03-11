import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side configuration for error tracking
 * Captures frontend errors, exceptions, and performance issues
 *
 * Environment variables required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN (from https://sentry.io)
 * - NEXT_PUBLIC_SENTRY_ENABLED: Set to "true" to enable (optional, defaults to true in production)
 */

const enabled =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  (process.env.NEXT_PUBLIC_SENTRY_ENABLED !== "false");

if (enabled) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === "production",

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0, // 10% in prod, 100% in dev
    debug: process.env.NODE_ENV !== "production",

    // Track user interactions
    integrations: [
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Capture replay for errors only in production
    replaysOnErrorSampleRate:
      process.env.NODE_ENV === "production" ? 0.5 : 1.0,
    replaysSessionSampleRate:
      process.env.NODE_ENV === "production" ? 0.1 : 0.0,

    // Ignore expected errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      // Random plugins/extensions
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      // Network timeouts
      "NetworkError",
      "TimeoutError",
      // User actions (not errors)
      "QuotaExceededError",
      // 3rd party script errors
      "gapi",
      "gtag",
    ],
  });
}

export { enabled };
