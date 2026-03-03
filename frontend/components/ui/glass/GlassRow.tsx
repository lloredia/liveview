"use client";

import { forwardRef, type HTMLAttributes } from "react";

interface GlassRowProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

export const GlassRow = forwardRef<HTMLDivElement, GlassRowProps>(
  function GlassRow({ active = false, className = "", children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={`
          border-b border-glass-border-light transition-colors duration-150
          hover:bg-glass-hover
          ${active ? "bg-glass-hover" : ""}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  },
);
