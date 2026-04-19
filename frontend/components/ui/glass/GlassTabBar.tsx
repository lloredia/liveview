"use client";

import { type ReactNode } from "react";

export interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  /** Separate from badge — renders as a dim count at the end of the label. */
  count?: number;
  /** Visual state indicator: "live" shows a pulsing red dot. */
  indicator?: "live" | "dot" | null;
}

type Variant = "pill" | "scroll" | "wrap";
type Size = "sm" | "md";

interface GlassTabBarProps {
  tabs: Tab[];
  active: string;
  onSelect: (key: string) => void;
  className?: string;
  variant?: Variant;
  size?: Size;
}

export function GlassTabBar({
  tabs,
  active,
  onSelect,
  className = "",
  variant = "pill",
  size = "md",
}: GlassTabBarProps) {
  const container =
    variant === "scroll"
      ? "flex gap-1.5 overflow-x-auto scrollbar-hide"
      : variant === "wrap"
        ? "flex flex-wrap gap-1.5"
        : "flex gap-0.5 rounded-[14px] border border-glass-border bg-glass p-1";

  const buttonBase =
    variant === "pill"
      ? "flex-1"
      : "shrink-0 rounded-[10px] border border-glass-border bg-glass";

  const pad = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";
  const text = size === "sm" ? "text-label-sm" : "text-label-md";

  return (
    <div className={`${container} ${className}`}>
      {tabs.map(({ key, label, icon, badge, count, indicator }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`
              relative rounded-[10px] ${pad} ${text} uppercase tracking-wider
              transition-all duration-200 ${buttonBase}
              ${isActive
                ? "bg-glass-elevated text-text-primary shadow-glass-sm"
                : "text-text-muted hover:text-text-secondary hover:bg-glass-hover"
              }
            `}
          >
            <span className="inline-flex items-center gap-1.5">
              {icon && <span className="shrink-0">{icon}</span>}
              {indicator === "live" && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
                </span>
              )}
              {indicator === "dot" && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green" />
              )}
              <span>{label}</span>
              {count != null && (
                <span className={`text-label-xs tabular-nums ${isActive ? "text-text-muted" : "text-text-dim"}`}>
                  {count}
                </span>
              )}
              {badge != null && (
                <span className={`text-label-xs ${isActive ? "opacity-60" : "opacity-40"}`}>
                  {badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
