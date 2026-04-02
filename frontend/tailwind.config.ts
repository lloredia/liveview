import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          card: "var(--color-surface-card)",
          hover: "var(--color-surface-hover)",
          border: "var(--color-surface-border)",
          "border-light": "var(--color-surface-border-light)",
        },
        accent: {
          green: "var(--color-accent-green)",
          blue: "var(--color-accent-blue)",
          red: "var(--color-accent-red)",
          amber: "var(--color-accent-amber)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          muted: "var(--color-text-muted)",
          dim: "var(--color-text-dim)",
        },
        glass: {
          DEFAULT: "var(--glass-bg)",
          hover: "var(--glass-bg-hover)",
          elevated: "var(--glass-bg-elevated)",
          prominent: "var(--glass-bg-prominent)",
          border: "var(--glass-border)",
          "border-light": "var(--glass-border-light)",
          highlight: "var(--glass-highlight)",
        },
      },
      fontFamily: {
        display: ["Outfit", "Helvetica Neue", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      fontSize: {
        "score-lg": ["1.25rem", { lineHeight: "1.2", fontWeight: "800" }],
        "score-md": ["1.0625rem", { lineHeight: "1.2", fontWeight: "800" }],
        "label-xs": ["0.5625rem", { lineHeight: "1.3", fontWeight: "700" }],
        "label-sm": ["0.625rem", { lineHeight: "1.3", fontWeight: "600" }],
        "label-md": ["0.6875rem", { lineHeight: "1.3", fontWeight: "600" }],
        "label-lg": ["0.75rem", { lineHeight: "1.3", fontWeight: "700" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.4", fontWeight: "500" }],
        "body-md": ["0.875rem", { lineHeight: "1.4", fontWeight: "500" }],
        "heading-sm": ["0.9375rem", { lineHeight: "1.3", fontWeight: "800" }],
      },
      borderRadius: {
        glass: "16px",
        "glass-lg": "24px",
        "glass-pill": "12px",
      },
      boxShadow: {
        "glass-sm": "0 1px 3px 0 var(--glass-shadow-ambient), 0 4px 12px 0 rgba(0,0,0,0.06)",
        "glass-md": "0 2px 8px 0 var(--glass-shadow-ambient), 0 8px 24px 0 rgba(0,0,0,0.1)",
        "glass-lg": "0 4px 16px 0 var(--glass-shadow), 0 12px 40px 0 rgba(0,0,0,0.15)",
      },
      animation: {
        pulse: "pulse 1.5s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease forwards",
        "slide-up": "slideUp 0.3s ease forwards",
        ping: "ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "scale-in": "scaleIn 0.2s ease forwards",
        "glass-shimmer": "glass-shimmer 2s ease-in-out infinite",
        "score-pulse": "score-pulse 1.5s ease-in-out",
        "score-pop-dramatic": "score-pop-dramatic 0.75s cubic-bezier(0.22,1,0.36,1)",
        "score-goal-moment": "score-goal-moment 0.9s cubic-bezier(0.22,1,0.36,1)",
        "score-flash-team": "score-flash-team 1.5s ease-out",
        "glass-fade-in": "glass-fade-in 0.25s ease forwards",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
