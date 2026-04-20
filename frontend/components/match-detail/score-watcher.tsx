"use client";

import { useEffect, useRef } from "react";
import { playGoalSound } from "@/lib/sounds";
import { isSoundEnabled } from "@/lib/notification-settings";

export function ScoreWatcher({
  scoreHome,
  scoreAway,
  live,
}: {
  scoreHome: number;
  scoreAway: number;
  live: boolean;
}) {
  const prevRef = useRef({ home: -1, away: -1 });
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.home === -1) {
      prevRef.current = { home: scoreHome, away: scoreAway };
      return;
    }
    if ((scoreHome !== prev.home || scoreAway !== prev.away) && live) {
      if (isSoundEnabled()) playGoalSound();
    }
    prevRef.current = { home: scoreHome, away: scoreAway };
  }, [scoreHome, scoreAway, live]);
  return null;
}
