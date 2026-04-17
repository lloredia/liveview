"use client";

import { useCallback, useState } from "react";

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
}

export function ShareButton({ title, text, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const fullUrl = `${window.location.origin}${url}`;

    // Use native share sheet on mobile if available
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch (e) {
        // User cancelled or share failed — fall through to copy
        if ((e as DOMException).name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Final fallback: select prompt
      window.prompt("Copy this link:", fullUrl);
    }
  }, [title, text, url]);

  return (
    <button
      onClick={handleShare}
      aria-label={copied ? "Link copied" : "Share match"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${
        copied
          ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
          : "border-surface-border bg-surface-card text-text-secondary hover:border-surface-border-light hover:text-text-primary"
      }`}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M10 2v10m0-10l-3 3m3-3l3 3M4 12v4a2 2 0 002 2h8a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}