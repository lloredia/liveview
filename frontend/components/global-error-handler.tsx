"use client";

import { useEffect } from "react";

/**
 * Captures uncaught errors and unhandled rejections
 * - Logs to console for Safari Web Inspector (iOS debugging)
 * - Helps diagnose "JS Eval error" from Capacitor
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = `[LiveView uncaught error] ${event.message}`;
      console.error(message, event.filename, event.lineno, event.colno, event.error);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const message = `[LiveView unhandled rejection] ${event.reason}`;
      console.error(message);
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
