"use client";

const SPORT_PILLS = [
  { value: "", label: "All" },
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "football", label: "Football" },
  { value: "baseball", label: "Baseball" },
  { value: "hockey", label: "Hockey" },
] as const;

interface NewsCategoryPillsProps {
  sport: string;
  onSportChange: (sport: string) => void;
}

export function NewsCategoryPills({ sport, onSportChange }: NewsCategoryPillsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin md:overflow-visible"
      role="tablist"
      aria-label="Sport filter"
    >
      {SPORT_PILLS.map(({ value, label }) => {
        const isSelected = sport === value;
        return (
          <button
            key={value || "all"}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSportChange(value)}
            className={`
              shrink-0 rounded-full border px-4 py-2 text-label-sm font-semibold transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-gradient-mid)]
              motion-reduce:transition-none
              ${isSelected
                ? "border-glass-border bg-glass-elevated text-text-primary shadow-glass-sm"
                : "border-glass-border-light bg-glass/60 text-text-secondary hover:bg-glass-hover hover:text-text-primary"
              }
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
