"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent-green text-white shadow-glass-sm hover:brightness-110",
  secondary: "glass-surface text-text-primary hover:bg-glass-hover",
  ghost: "text-text-muted hover:text-text-primary hover:bg-glass-hover",
};

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  function GlassButton(
    { variant = "secondary", size = "md", className = "", children, ...props },
    ref,
  ) {
    const sizeClass = size === "sm"
      ? "h-7 px-2.5 text-label-sm rounded-[10px]"
      : "h-9 px-4 text-body-sm rounded-glass-pill font-semibold";

    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-1.5
          glass-press transition-all duration-150
          ${sizeClass}
          ${variantStyles[variant]}
          ${className}
        `}
        {...props}
      >
        {children}
      </button>
    );
  },
);
