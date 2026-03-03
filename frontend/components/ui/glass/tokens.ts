/**
 * Glass Design System — Design Tokens
 *
 * Single source of truth for spacing, radii, blur levels, and
 * composite class strings used by all Glass* components.
 */

export const GLASS_RADII = {
  card: "rounded-[16px]",
  sheet: "rounded-[24px]",
  pill: "rounded-[12px]",
  row: "rounded-[12px]",
  button: "rounded-[12px]",
  full: "rounded-full",
} as const;

export const GLASS_SPACING = {
  xs: "p-1.5",
  sm: "p-2.5",
  md: "p-4",
  lg: "p-6",
} as const;

/** Classes for a "fake glass" surface (no backdrop-filter — safe for list items). */
export const FAKE_GLASS =
  "glass-surface transition-colors duration-150" as const;

/** Classes for a "fake glass" surface with hover state. */
export const FAKE_GLASS_HOVER =
  "glass-surface hover:bg-glass-hover transition-colors duration-150" as const;

/** Classes for a real blurred glass surface (use sparingly: headers, tab bars, modals). */
export const REAL_GLASS =
  "glass-surface-elevated glass-blur" as const;

/** Classes for a prominent blurred glass surface (modals, sheets). */
export const PROMINENT_GLASS =
  "glass-surface-prominent glass-blur" as const;

/** Shared transition for interactive glass elements. */
export const GLASS_INTERACTIVE =
  "glass-press cursor-pointer" as const;

export const GLASS_DIVIDER = "glass-divider" as const;
