"use client";

import type { FormResult } from "@/lib/form-guide";

interface FormBadgeProps {
  results: FormResult[];
  size?: "sm" | "md";
}

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  W: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
  L: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  D: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
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