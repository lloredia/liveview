"use client";

import { type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

interface GlassTabBarProps {
  tabs: Tab[];
  active: string;
  onSelect: (key: string) => void;
  className?: string;
}

export function GlassTabBar({ tabs, active, onSelect, className = "" }: GlassTabBarProps) {
  return (
    <div
      className={`flex gap-0.5 rounded-[14px] border border-glass-border bg-glass p-1 ${className}`}
    >
      {tabs.map(({ key, label, badge }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`
              relative flex-1 rounded-[10px] px-3 py-1.5 text-label-md uppercase tracking-wider
              transition-all duration-200
              ${isActive
                ? "bg-glass-elevated text-text-primary shadow-glass-sm"
                : "text-text-muted hover:text-text-secondary hover:bg-glass-hover"
              }
            `}
          >
            {label}
            {badge != null && (
              <span className={`ml-1 text-label-xs ${isActive ? "opacity-60" : "opacity-40"}`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
