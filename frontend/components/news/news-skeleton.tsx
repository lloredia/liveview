"use client";

export function NewsCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-surface-border bg-surface-card">
      <div className="aspect-video w-full bg-surface-hover" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-1/3 rounded bg-surface-hover" />
        <div className="h-4 w-full rounded bg-surface-hover" />
        <div className="h-4 w-4/5 rounded bg-surface-hover" />
        <div className="h-3 w-2/5 rounded bg-surface-hover" />
      </div>
    </div>
  );
}

export function NewsCardSkeletonCompact() {
  return (
    <div className="flex animate-pulse gap-3 rounded-lg border border-surface-border bg-surface-card p-3">
      <div className="h-20 w-20 shrink-0 rounded-lg bg-surface-hover" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-full rounded bg-surface-hover" />
        <div className="h-3 w-3/4 rounded bg-surface-hover" />
        <div className="h-3 w-1/3 rounded bg-surface-hover" />
      </div>
    </div>
  );
}

export function NewsFeedSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) =>
        i % 3 === 0 ? (
          <NewsCardSkeleton key={i} />
        ) : (
          <NewsCardSkeletonCompact key={i} />
        ),
      )}
    </div>
  );
}
