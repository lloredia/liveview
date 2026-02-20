export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="mb-6 text-6xl">📡</div>
      <h1 className="mb-2 text-xl font-bold text-text-primary">You&apos;re Offline</h1>
      <p className="mb-6 max-w-sm text-[13px] text-text-secondary">
        LiveView needs an internet connection to fetch live scores. Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-xl bg-accent-blue px-6 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
      >
        Try Again
      </button>
      <p className="mt-8 text-[10px] text-text-dim">
        Cached data may still be available for recently viewed matches.
      </p>
    </div>
  );
}
