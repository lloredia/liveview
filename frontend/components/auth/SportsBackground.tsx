"use client";

/**
 * Dark cinematic background with lightweight sport silhouettes.
 * CSS-only drift animation; respects prefers-reduced-motion (static fallback).
 * No video, no heavy blur on layers — one blur is reserved for the glass card.
 */
export function SportsBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Base gradient — dark with depth */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#08080e] via-[#0c0c14] to-[#06060c]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,230,118,0.04) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(68,138,255,0.03) 0%, transparent 45%)",
        }}
      />

      {/* Sport layer — SVG silhouettes with slow drift; prefers-reduced-motion disables via global CSS */}
      <div className="sports-drift absolute inset-0 opacity-[0.14]">
        {/* Football / NFL */}
        <div className="sport-float absolute left-[8%] top-[18%] text-white/90" style={{ animationDelay: "0s" }}>
          <svg viewBox="0 0 48 24" className="h-8 w-16" aria-hidden>
            <ellipse cx="24" cy="12" rx="22" ry="10" fill="currentColor" opacity="0.5" />
            <path d="M4 12h40" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          </svg>
        </div>
        {/* Soccer */}
        <div className="sport-float absolute right-[12%] top-[25%] text-white/80" style={{ animationDelay: "1s" }}>
          <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M16 4a4 4 0 0 0 0 24M16 4a4 4 0 0 1 0 24" stroke="currentColor" strokeWidth="0.8" />
            <path d="M4 16h24" stroke="currentColor" strokeWidth="0.8" />
          </svg>
        </div>
        {/* Hockey puck */}
        <div className="sport-float absolute left-[15%] bottom-[28%] text-white/70" style={{ animationDelay: "2s" }}>
          <svg viewBox="0 0 40 20" className="h-6 w-12" aria-hidden>
            <ellipse cx="20" cy="10" rx="18" ry="8" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
        {/* Baseball */}
        <div className="sport-float absolute right-[20%] bottom-[22%] text-white/60" style={{ animationDelay: "0.5s" }}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <path d="M12 2 Q16 6 12 12 Q8 18 12 22" stroke="currentColor" strokeWidth="0.6" fill="none" />
            <path d="M12 2 Q8 6 12 12 Q16 18 12 22" stroke="currentColor" strokeWidth="0.6" fill="none" />
          </svg>
        </div>
        {/* Basketball */}
        <div className="sport-float absolute left-[75%] top-[55%] text-white/50" style={{ animationDelay: "1.5s" }}>
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
            <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="0.9" />
            <path d="M16 3 C8 8 8 24 16 29" stroke="currentColor" strokeWidth="0.7" fill="none" />
            <path d="M16 3 C24 8 24 24 16 29" stroke="currentColor" strokeWidth="0.7" fill="none" />
          </svg>
        </div>
        {/* Secondary accents */}
        <div className="sport-float absolute left-[5%] top-[60%] text-white/40" style={{ animationDelay: "0.7s" }}>
          <span className="text-2xl font-bold tracking-widest opacity-60">LIVE</span>
        </div>
        <div className="sport-float absolute right-[8%] top-[70%] text-white/30" style={{ animationDelay: "0.3s" }}>
          <span className="text-lg font-semibold tracking-wider opacity-50">VIEW</span>
        </div>
      </div>
    </div>
  );
}
