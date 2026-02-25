"use client";

import { useEffect } from "react";

/**
 * Logs uncaught errors and unhandled rejections so they appear in Safari Web Inspector
 * when debugging the iOS app. Helps diagnose "JS Eval error" from Capacitor by
 * ensuring the actual exception message is visible.
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error("[LiveView uncaught error]", event.message, event.filename, event.lineno, event.colno, event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error("[LiveView unhandled rejection]", event.reason);
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
