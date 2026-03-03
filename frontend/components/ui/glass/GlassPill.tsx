"use client";

import { type HTMLAttributes } from "react";

type PillVariant = "live" | "ht" | "ft" | "scheduled" | "info" | "accent";

const variantStyles: Record<PillVariant, string> = {
  live: "bg-accent-red/15 text-accent-red border-accent-red/20",
  ht: "bg-accent-amber/15 text-accent-amber border-accent-amber/20",
  ft: "bg-glass text-text-muted border-glass-border",
  scheduled: "bg-glass text-text-secondary border-glass-border",
  info: "bg-accent-blue/15 text-accent-blue border-accent-blue/20",
  accent: "bg-accent-green/15 text-accent-green border-accent-green/20",
};

interface GlassPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  size?: "xs" | "sm";
  pulse?: boolean;
}

export function GlassPill({
  variant = "info",
  size = "xs",
  pulse = false,
  className = "",
  children,
  ...props
}: GlassPillProps) {
  const sizeClass = size === "xs"
    ? "px-1.5 py-px text-label-xs"
    : "px-2 py-0.5 text-label-sm";

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-glass-pill border font-bold leading-tight
        ${sizeClass}
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
