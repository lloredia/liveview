"use client";

import { useEffect, useRef, useState } from "react";
import { hapticHeavyImpact } from "@/lib/haptics";

interface AnimatedScoreProps {
  value: number;
  className?: string;
}

export function AnimatedScore({ value, className = "" }: AnimatedScoreProps) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;

    const prev = prevRef.current;
    prevRef.current = value;

    // Flash effect - more dramatic
    setFlash(true);
    setTimeout(() => setFlash(false), 900);

    // Heavy haptic on score change (goal)
    hapticHeavyImpact();

    // Animate counting
    const diff = value - prev;
    const steps = Math.min(Math.abs(diff), 10);
    const stepTime = 300 / steps;
    let current = prev;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = prev + Math.round((diff * step) / steps);
      setDisplay(current);
      if (step >= steps) {
        clearInterval(timer);
        setDisplay(value);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <span
      className={`inline-block transition-transform ${className} ${
        flash
          ? "score-goal-moment !text-accent-green drop-shadow-[0_0_24px_rgba(0,230,118,0.6)]"
          : ""
      }`}
      style={{
        transition:
          "transform 0.4s cubic-bezier(0.22,1,0.36,1), color 0.8s ease, filter 0.8s ease",
      }}
    >
      {display}
    </span>
  );
}