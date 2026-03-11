"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);

    // Report to Sentry in production
    if (process.env.NODE_ENV === "production") {
      Sentry.captureException(error, {
        tags: { type: "react_error_boundary" },
        contexts: {
          component: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6">
          <div className="text-lg font-semibold text-text-primary">Something went wrong</div>
          <p className="max-w-md text-center text-sm text-text-muted">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-accent-green/10 px-4 py-2 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/20"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
