"use client";

interface GlassDividerProps {
  className?: string;
  vertical?: boolean;
}

export function GlassDivider({ className = "", vertical = false }: GlassDividerProps) {
  if (vertical) {
    return (
      <div
        className={`w-px self-stretch bg-gradient-to-b from-transparent via-glass-border to-transparent ${className}`}
      />
    );
  }
  return <div className={`glass-divider ${className}`} />;
}
