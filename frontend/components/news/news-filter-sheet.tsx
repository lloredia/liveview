"use client";

import { GlassModalSheet } from "@/components/ui/glass";
import { GlassDivider } from "@/components/ui/glass";
import { CATEGORY_LABELS } from "./news-constants";

const SPORTS = [
  { value: "", label: "All sports" },
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "football", label: "Football" },
  { value: "baseball", label: "Baseball" },
  { value: "hockey", label: "Hockey" },
];

const TIME_OPTIONS = [
  { value: 0, label: "All time" },
  { value: 6, label: "Last 6 hours" },
  { value: 24, label: "Last 24 hours" },
];

const CATEGORIES = [
  "all",
  "trending",
  "transfer",
  "injury",
  "trade",
  "draft",
  "result",
  "breaking",
  "rumor",
  "club",
  "analysis",
  "general",
];

interface NewsFilterSheetProps {
  open: boolean;
  onClose: () => void;
  sport: string;
  category: string;
  hours: number;
  onSportChange: (s: string) => void;
  onCategoryChange: (c: string) => void;
  onHoursChange: (h: number) => void;
}

export function NewsFilterSheet({
  open,
  onClose,
  sport,
  category,
  hours,
  onSportChange,
  onCategoryChange,
  onHoursChange,
}: NewsFilterSheetProps) {
  return (
    <GlassModalSheet open={open} onClose={onClose} title="Filters">
      <div className="space-y-5">
        <section aria-labelledby="filter-sport">
          <h3 id="filter-sport" className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-muted">
            Sport
          </h3>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(({ value, label }) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => onSportChange(value)}
                className={`
                  rounded-full border px-3 py-1.5 text-label-sm font-semibold transition-colors
                  focus:outline-none focus:ring-2 focus:ring-accent-green/50
                  ${sport === value
                    ? "border-glass-border bg-glass-elevated text-text-primary"
                    : "border-glass-border-light bg-glass/60 text-text-secondary hover:bg-glass-hover"
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <GlassDivider />
        <section aria-labelledby="filter-time">
          <h3 id="filter-time" className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-muted">
            Time
          </h3>
          <div className="flex flex-wrap gap-2">
            {TIME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onHoursChange(value)}
                className={`
                  rounded-full border px-3 py-1.5 text-label-sm font-semibold transition-colors
                  focus:outline-none focus:ring-2 focus:ring-accent-green/50
                  ${hours === value
                    ? "border-glass-border bg-glass-elevated text-text-primary"
                    : "border-glass-border-light bg-glass/60 text-text-secondary hover:bg-glass-hover"
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <GlassDivider />
        <section aria-labelledby="filter-category">
          <h3 id="filter-category" className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-muted">
            Category
          </h3>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat)}
                className={`
                  rounded-full border px-3 py-1.5 text-label-sm font-semibold transition-colors
                  focus:outline-none focus:ring-2 focus:ring-accent-green/50
                  ${category === cat
                    ? "border-glass-border bg-glass-elevated text-text-primary"
                    : "border-glass-border-light bg-glass/60 text-text-secondary hover:bg-glass-hover"
                  }
                `}
              >
                {cat === "all" ? "All" : cat === "trending" ? "Trending" : CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        </section>
      </div>
    </GlassModalSheet>
  );
}
