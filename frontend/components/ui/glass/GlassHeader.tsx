"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { REAL_GLASS } from "./tokens";

interface GlassHeaderProps extends HTMLAttributes<HTMLElement> {
  sticky?: boolean;
  as?: "header" | "div" | "nav";
}

export const GlassHeader = forwardRef<HTMLElement, GlassHeaderProps>(
  function GlassHeader(
    { sticky = true, as: Tag = "header", className = "", children, ...props },
    ref,
  ) {
    return (
      <Tag
        ref={ref as any}
        className={`
          ${REAL_GLASS}
          ${sticky ? "sticky top-0 z-50" : ""}
          border-b border-glass-border
          ${className}
        `}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);
