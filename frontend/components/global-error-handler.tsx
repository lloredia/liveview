"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Captures uncaught errors and unhandled rejections
 * - Logs to console for Safari Web Inspector (iOS debugging)
 * - Reports to Sentry for production error tracking (when enabled)
 * - Helps diagnose "JS Eval error" from Capacitor
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = `[LiveView uncaught error] ${event.message}`;
      console.error(message, event.filename, event.lineno, event.colno, event.error);

      // Report to Sentry in production
      if (process.env.NODE_ENV === "production") {
        Sentry.captureException(event.error || new Error(message), {
          tags: { type: "uncaught_error" },
          contexts: {
            script: {
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
            },
          },
        });
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const message = `[LiveView unhandled rejection] ${event.reason}`;
      console.error(message);

      // Report to Sentry in production
      if (process.env.NODE_ENV === "production") {
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(typeof event.reason === "string" ? event.reason : JSON.stringify(event.reason));

        Sentry.captureException(error, {
          tags: { type: "unhandled_rejection" },
        });
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
