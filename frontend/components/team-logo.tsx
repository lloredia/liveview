"use client";

import { useState } from "react";

interface TeamLogoProps {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}

export function TeamLogo({ url, name, size = 40, className = "" }: TeamLogoProps) {
  const [err, setErr] = useState(false);

  if (!url || err) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border-2 border-surface-border bg-gradient-to-br from-surface-hover to-surface-card font-bold text-text-tertiary ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.32,
        }}
      >
        {(name || "?").substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name || "Team"}
      className={`rounded-full object-contain ${className}`}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}
