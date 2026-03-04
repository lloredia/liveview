"use client";

import { type ReactNode } from "react";
import { AUTH_GLASS } from "@/lib/ui/glass";

interface GlassAuthCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Premium glass card for auth flows: translucent fill, subtle border,
 * inner highlight, single backdrop-blur. WCAG AA contrast for content.
 */
export function GlassAuthCard({ children, className = "" }: GlassAuthCardProps) {
  return (
    <div
      className={`
        relative w-full max-w-[400px]
        ${AUTH_GLASS.cardBg}
        ${AUTH_GLASS.cardBorder}
        ${AUTH_GLASS.cardShadow}
        ${AUTH_GLASS.cardRadius}
        ${AUTH_GLASS.cardBlur}
        px-8 py-10
        ${className}
      `}
    >
      {children}
    </div>
  );
}
