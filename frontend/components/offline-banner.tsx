"use client";

interface OfflineBannerProps {
  onRetry?: () => void;
}

export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  return (
    <div
      data-testid="offline-notice"
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label-md text-amber-700 dark:text-amber-300"
    >
      <span>Offline — showing last updated data</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
