"use client";

import { useEffect, useRef, useState } from "react";

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

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 600);

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
        flash ? "scale-110 !text-accent-green drop-shadow-[0_0_20px_rgba(0,230,118,0.5)]" : ""
      }`}
      style={{ transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1), color 0.6s ease, filter 0.6s ease" }}
    >
      {display}
    </span>
  );
}