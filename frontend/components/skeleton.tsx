export function MatchCardSkeleton() {
  return (
    <div className="flex h-12 animate-pulse items-center border-b border-glass-border-light">
      <div className="flex w-[60px] shrink-0 items-center justify-center px-2">
        <div className="h-3 w-8 rounded-[8px] bg-glass-hover" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-2">
        <div className="h-3 w-20 rounded-[8px] bg-glass-hover" />
        <div className="h-5 w-5 rounded-full bg-glass-hover" />
      </div>
      <div className="flex w-[52px] shrink-0 items-center justify-center">
        <div className="h-4 w-8 rounded-[8px] bg-glass-hover" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        <div className="h-5 w-5 rounded-full bg-glass-hover" />
        <div className="h-3 w-20 rounded-[8px] bg-glass-hover" />
      </div>
    </div>
  );
}

export function LeagueGroupSkeleton() {
  return (
    <div className="mb-4 mx-2">
      <div className="mb-0 flex items-center gap-2 rounded-t-[14px] border border-b-0 border-glass-border bg-glass px-3 py-2">
        <div className="h-4 w-4 animate-pulse rounded bg-glass-hover" />
        <div className="h-3 w-32 animate-pulse rounded-[8px] bg-glass-hover" />
      </div>
      <div className="overflow-hidden rounded-b-[14px] border border-t-0 border-glass-border bg-glass">
        <MatchCardSkeleton />
        <MatchCardSkeleton />
        <MatchCardSkeleton />
      </div>
    </div>
  );
}

export function TodayViewSkeleton() {
  return (
    <div className="space-y-1">
      <div className="mb-3 flex gap-1.5 overflow-hidden px-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 w-14 animate-pulse rounded-glass-pill bg-glass-hover" />
        ))}
      </div>
      <div className="mb-4 mx-2">
        <div className="h-10 animate-pulse rounded-[14px] border border-glass-border bg-glass" />
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
      <div className="mb-3 flex items-center gap-2.5 px-3">
        <div className="h-6 w-6 animate-pulse rounded bg-glass-hover" />
        <div className="h-4 w-32 animate-pulse rounded-[8px] bg-glass-hover" />
      </div>
      <div className="mb-4 mx-3">
        <div className="h-10 animate-pulse rounded-[14px] border border-glass-border bg-glass" />
      </div>
      <div className="mx-2 overflow-hidden rounded-[14px] border border-glass-border bg-glass">
        <MatchCardSkeleton />
        <MatchCardSkeleton />
        <MatchCardSkeleton />
        <MatchCardSkeleton />
      </div>
    </div>
  );
}
