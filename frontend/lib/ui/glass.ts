/**
 * Reusable glass tokens for auth and premium surfaces.
 * Complements components/ui/glass/tokens.ts with auth-specific values.
 */

export const AUTH_GLASS = {
  /** Card: single backdrop-blur surface for login/signup */
  cardBlur: "backdrop-blur-[20px] supports-[backdrop-filter]:backdrop-blur-[20px]",
  /** Translucent fill for dark theme auth card */
  cardBg: "bg-white/[0.06]",
  /** Border + inner highlight for Apple glass feel */
  cardBorder:
    "border border-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
  /** Soft ambient shadow behind card */
  cardShadow: "shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2)]",
  /** Auth card radius (24px for modals/sheets) */
  cardRadius: "rounded-[24px]",
  /** Button radius on auth card */
  buttonRadius: "rounded-[14px]",
} as const;
