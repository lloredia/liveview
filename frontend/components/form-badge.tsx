"use client";

import type { FormResult } from "@/lib/form-guide";

interface FormBadgeProps {
  results: FormResult[];
  size?: "sm" | "md";
}

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  W: { bg: "bg-accent-green/15", text: "text-accent-green", border: "border-accent-green/30" },
  L: { bg: "bg-accent-red/15", text: "text-accent-red", border: "border-accent-red/30" },
  D: { bg: "bg-accent-amber/15", text: "text-accent-amber", border: "border-accent-amber/30" },
};

export function FormBadge({ results, size = "sm" }: FormBadgeProps) {
  if (results.length === 0) return null;

  const px = size === "sm" ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]";

  return (
    <div className="flex items-center gap-0.5">
      {results.map((r, i) => {
        const c = COLORS[r.result];
        return (
          <span
            key={i}
            title={`${r.result} ${r.score} vs ${r.opponent}`}
            className={`inline-flex items-center justify-center rounded border font-bold ${px} ${c.bg} ${c.text} ${c.border}`}
          >
            {r.result}
          </span>
        );
      })}
    </div>
  );
}