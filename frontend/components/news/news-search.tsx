"use client";

import { useCallback, useEffect, useState } from "react";

const DEBOUNCE_MS = 300;

interface NewsSearchProps {
  onSearch: (q: string) => void;
  placeholder?: string;
}

export function NewsSearch({ onSearch, placeholder = "Search articles..." }: NewsSearchProps) {
  const [value, setValue] = useState("");

  const debouncedSearch = useCallback(
    (v: string) => {
      const t = setTimeout(() => onSearch(v.trim()), DEBOUNCE_MS);
      return () => clearTimeout(t);
    },
    [onSearch],
  );

  useEffect(() => {
    return debouncedSearch(value);
  }, [value, debouncedSearch]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-surface-border bg-surface-card py-2 pl-9 pr-3 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent-green focus:outline-none focus:ring-1 focus:ring-accent-green"
        aria-label="Search news"
      />
    </div>
  );
}
