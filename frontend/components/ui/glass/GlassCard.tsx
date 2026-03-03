"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { FAKE_GLASS, GLASS_RADII, GLASS_INTERACTIVE } from "./tokens";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: string;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    { interactive = false, padding = "p-3", className = "", children, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`${FAKE_GLASS} ${GLASS_RADII.card} ${padding} ${interactive ? GLASS_INTERACTIVE : ""} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);
