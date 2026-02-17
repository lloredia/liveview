"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  startTime: string;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calcTimeLeft(target: string): TimeLeft {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    total: diff,
  };
}

function formatCountdown(t: TimeLeft): string {
  if (t.total <= 0) return "Starting...";
  if (t.days > 0) return `${t.days}d ${t.hours}h`;
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`;
  if (t.minutes > 0) return `${t.minutes}m ${t.seconds}s`;
  return `${t.seconds}s`;
}

export function Countdown({ startTime, className = "" }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(startTime));

  useEffect(() => {
    const tick = () => setTimeLeft(calcTimeLeft(startTime));
    tick();
    const intervalMs = timeLeft.hours === 0 && timeLeft.days === 0 ? 1000 : 30000;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [startTime, timeLeft.hours, timeLeft.days]);

  if (timeLeft.total <= 0) {
    return <span className={`text-accent-green ${className}`}>Starting...</span>;
  }

  const urgency =
    timeLeft.total < 3600000
      ? "text-accent-green"
      : timeLeft.total < 86400000
        ? "text-accent-blue"
        : "text-text-muted";

  return (
    <span className={`font-mono tabular-nums ${urgency} ${className}`} title={new Date(startTime).toLocaleString()}>
      {formatCountdown(timeLeft)}
    </span>
  );
}