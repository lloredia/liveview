"use client";

/**
 * Vignette overlay for readability over animated background.
 * Radial gradient from transparent center to dark edges — no animation.
 */
export function VignetteOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{
        background: `radial-gradient(ellipse 90% 80% at 50% 45%, transparent 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.55) 100%)`,
      }}
      aria-hidden
    />
  );
}
