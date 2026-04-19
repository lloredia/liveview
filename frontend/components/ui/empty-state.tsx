"use client";

import { type ReactNode } from "react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  variant?: "default" | "compact";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
  className = "",
}: EmptyStateProps) {
  const isCompact = variant === "compact";
  const pad = isCompact ? "py-6 px-4" : "py-12 px-6";
  const iconSize = isCompact ? "h-6 w-6" : "h-10 w-10";
  const titleClass = isCompact
    ? "text-label-md font-semibold text-text-primary"
    : "text-body-md font-semibold text-text-primary";
  const descClass = isCompact
    ? "text-label-sm text-text-muted"
    : "text-label-md text-text-muted";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${pad} ${className}`}
      role="status"
    >
      {icon && (
        <div className={`mb-3 flex ${iconSize} items-center justify-center text-text-dim`}>
          {icon}
        </div>
      )}
      <div className={titleClass}>{title}</div>
      {description && (
        <div className={`mt-1 max-w-xs ${descClass}`}>{description}</div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-4 rounded-full px-4 py-1.5 text-label-md font-semibold transition-colors ${
            action.variant === "secondary"
              ? "border border-glass-border text-text-secondary hover:bg-glass-hover"
              : "bg-accent-green text-black hover:bg-accent-green/90"
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
