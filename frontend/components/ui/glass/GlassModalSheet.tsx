"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

interface GlassModalSheetProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function GlassModalSheet({
  open,
  onClose,
  title,
  children,
  className = "",
  ...props
}: GlassModalSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 glass-blur-light"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          relative z-10 w-full max-w-lg
          glass-surface-prominent glass-blur
          rounded-t-[24px] sm:rounded-[24px]
          p-6 pb-8
          animate-glass-fade-in
          ${className}
        `}
        {...props}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-heading-sm text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-glass-hover text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
