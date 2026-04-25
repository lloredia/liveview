/**
 * Design tokens shared across the app.
 * Colors are exposed for both light + dark schemes; pick at render time
 * with useColorScheme().
 */

const dark = {
  surface: "#111118",
  surfaceRaised: "#16161f",
  surfaceCard: "#1a1a25",
  surfaceHover: "#22222f",
  surfaceBorder: "#2a2a3a",
  textPrimary: "#f0f0f5",
  textSecondary: "#b0b0c4",
  textTertiary: "#8080a0",
  textMuted: "#606078",
  textDim: "#404058",
  accentGreen: "#00E676",
  accentBlue: "#448AFF",
  accentRed: "#FF1744",
  accentAmber: "#FFD740",
  pitchBg: "#0d3d1a",
  pitchAccent: "#1a4d2a",
};

const light = {
  surface: "#f8f9fb",
  surfaceRaised: "#ffffff",
  surfaceCard: "#ffffff",
  surfaceHover: "#f0f1f4",
  surfaceBorder: "#e5e7ec",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textTertiary: "#64748b",
  textMuted: "#94a3b8",
  textDim: "#cbd5e1",
  accentGreen: "#059669",
  accentBlue: "#2563eb",
  accentRed: "#dc2626",
  accentAmber: "#d97706",
  pitchBg: "#2f7a3a",
  pitchAccent: "#3d8f47",
};

export type ColorTokens = typeof dark;

export const colors = { dark, light };

/**
 * Type sizes — slightly larger than the web defaults to give iPad
 * comfortable legibility out of the gate.
 */
export const text = {
  labelXs: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const },
  labelSm: { fontSize: 12, lineHeight: 15, fontWeight: "600" as const },
  labelMd: { fontSize: 13, lineHeight: 17, fontWeight: "600" as const },
  labelLg: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const },
  bodyMd: { fontSize: 16, lineHeight: 22, fontWeight: "500" as const },
  bodyLg: { fontSize: 17, lineHeight: 24, fontWeight: "500" as const },
  headingSm: { fontSize: 18, lineHeight: 22, fontWeight: "700" as const },
  headingMd: { fontSize: 22, lineHeight: 26, fontWeight: "800" as const },
  headingLg: { fontSize: 28, lineHeight: 32, fontWeight: "800" as const },
  scoreMd: { fontSize: 22, lineHeight: 24, fontWeight: "800" as const },
  scoreLg: { fontSize: 36, lineHeight: 40, fontWeight: "900" as const },
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
};
