"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GlassHeader } from "@/components/ui/glass";

const DEBOUNCE_MS = 300;

interface NewsHeaderProps {
  onSearch: (q: string) => void;
  onOpenFilter: () => void;
  searchPlaceholder?: string;
}

export function NewsHeader({
  onSearch,
  onOpenFilter,
  searchPlaceholder = "Search articles…",
}: NewsHeaderProps) {
  const [value, setValue] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(v.trim()), DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <GlassHeader className="flex h-12 items-center gap-2 px-3 md:px-4">
      <Link
        href="/"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-green/50"
        aria-label="Back to LiveView"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-heading-sm font-semibold text-text-primary">
        News
      </h1>
      <div className="relative flex min-w-0 max-w-[180px] flex-1 sm:max-w-[220px]">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={handleChange}
          placeholder={searchPlaceholder}
          className="w-full rounded-[10px] border-0 bg-glass/80 py-1.5 pl-8 pr-2 text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-green/40"
          aria-label="Search news"
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilter}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-green/50"
        aria-label="Open filters"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </GlassHeader>
  );
}
