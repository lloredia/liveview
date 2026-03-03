"use client";

const PROVIDER_NAME = "ESPN";

interface ProviderAttributionProps {
  className?: string;
}

export function ProviderAttribution({ className = "" }: ProviderAttributionProps) {
  return (
    <p
      className={`text-label-xs text-text-dim ${className}`}
      aria-label={`Scores powered by ${PROVIDER_NAME}`}
    >
      Scores powered by {PROVIDER_NAME}
    </p>
  );
}
