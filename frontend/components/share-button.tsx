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
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${
        copied
          ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
          : "border-surface-border bg-surface-card text-text-secondary hover:border-surface-border-light hover:text-text-primary"
      }`}
    >
      {copied ? (
        <>
          <span>✓</span> Copied!
        </>
      ) : (
        <>
          <span>🔗</span> Share
        </>
      )}
    </button>
  );
}