export function MatchCardSkeleton() {
  return (
    <div className="flex h-12 animate-pulse items-center border-b border-surface-border">
      <div className="flex w-[60px] shrink-0 items-center justify-center px-2">
        <div className="h-3 w-8 rounded bg-surface-hover" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-2">
        <div className="h-3 w-20 rounded bg-surface-hover" />
        <div className="h-5 w-5 rounded-full bg-surface-hover" />
      </div>
      <div className="flex w-[52px] shrink-0 items-center justify-center">
        <div className="h-4 w-8 rounded bg-surface-hover" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        <div className="h-5 w-5 rounded-full bg-surface-hover" />
        <div className="h-3 w-20 rounded bg-surface-hover" />
      </div>
    </div>
  );
}

export function LeagueGroupSkeleton() {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 px-3 py-2">
        <div className="h-4 w-4 animate-pulse rounded bg-surface-hover" />
        <div className="h-3 w-32 animate-pulse rounded bg-surface-hover" />
      </div>
      <MatchCardSkeleton />
      <MatchCardSkeleton />
      <MatchCardSkeleton />
    </div>
  );
}

export function TodayViewSkeleton() {
  return (
    <div className="space-y-1">
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 w-14 animate-pulse rounded-full bg-surface-hover" />
        ))}
      </div>
      <LeagueGroupSkeleton />
      <LeagueGroupSkeleton />
      <LeagueGroupSkeleton />
    </div>
  );
}

export function ScoreboardSkeleton() {
  return (
    <div className="space-y-1">
      <div className="mb-3 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded bg-surface-hover" />
        ))}
      </div>
      <MatchCardSkeleton />
      <MatchCardSkeleton />
      <MatchCardSkeleton />
      <MatchCardSkeleton />
    </div>
  );
}
