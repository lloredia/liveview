"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { FAKE_GLASS, REAL_GLASS, PROMINENT_GLASS, GLASS_RADII } from "./tokens";

type Elevation = "flat" | "elevated" | "prominent";

interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  blur?: boolean;
  radius?: keyof typeof GLASS_RADII;
}

const elevationMap: Record<Elevation, string> = {
  flat: FAKE_GLASS,
  elevated: REAL_GLASS,
  prominent: PROMINENT_GLASS,
};

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function GlassSurface(
    { elevation = "flat", blur, radius = "card", className = "", children, ...props },
    ref,
  ) {
    const surface = blur && elevation === "flat" ? REAL_GLASS : elevationMap[elevation];
    return (
      <div
        ref={ref}
        className={`${surface} ${GLASS_RADII[radius]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);
