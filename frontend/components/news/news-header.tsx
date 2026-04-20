"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GlassHeader } from "@/components/ui/glass";
import { ArrowLeft, Search as SearchIcon, SlidersHorizontal } from "lucide-react";

const DEBOUNCE_MS = 300;

interface NewsHeaderProps {
  onSearch: (q: string) => void;
  onOpenFilter: () => void;
  searchPlaceholder?: string;
}

export function NewsHeader({
  onSearch,
  onOpenFilter,
  searchPlaceholder = "Search news",
}: NewsHeaderProps) {
  const [value, setValue] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(v.trim()), DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <GlassHeader className="flex h-11 items-center gap-2 px-3 md:px-4">
      <Link
        href="/"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary"
        aria-label="Back to LiveView"
      >
        <ArrowLeft size={18} strokeWidth={2} />
      </Link>
      <div className="relative min-w-0 flex-1">
        <SearchIcon
          size={14}
          strokeWidth={2}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={value}
          onChange={handleChange}
          placeholder={searchPlaceholder}
          className="w-full rounded-[10px] border border-glass-border bg-glass/60 py-1.5 pl-8 pr-2 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-green/50 focus:outline-none"
          aria-label="Search news"
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilter}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary"
        aria-label="Open filters"
      >
        <SlidersHorizontal size={16} strokeWidth={2} />
      </button>
    </GlassHeader>
  );
}
