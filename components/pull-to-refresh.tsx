"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const THRESHOLD = 80;
const MAX_PULL = 130;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isTracking = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el) return;

    // Only activate when scrolled to top
    if (el.scrollTop > 5) return;

    startY.current = e.touches[0].clientY;
    isTracking.current = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTracking.current || refreshing) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    if (delta < 0) {
      // Scrolling up — ignore
      isTracking.current = false;
      setPulling(false);
      setPullDistance(0);
      return;
    }

    // Apply resistance curve
    const distance = Math.min(delta * 0.5, MAX_PULL);
    setPulling(true);
    setPullDistance(distance);

    if (distance > 10) {
      e.preventDefault();
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isTracking.current) return;
    isTracking.current = false;

    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);

      try {
        await onRefresh();
      } catch {
        // Silently handle refresh errors
      }

      setRefreshing(false);
    }

    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pulling || refreshing;

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto">
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center overflow-hidden transition-all"
        style={{
          height: showIndicator ? `${pullDistance}px` : "0px",
          opacity: showIndicator ? 1 : 0,
          transition: pulling ? "none" : "all 0.3s ease",
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <div
            className={`h-6 w-6 rounded-full border-[2.5px] border-surface-border border-t-accent-green ${
              refreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
              transition: pulling ? "none" : "transform 0.3s ease",
            }}
          />
          <span className="text-[10px] font-semibold text-text-muted">
            {refreshing ? "Refreshing..." : progress >= 1 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: showIndicator ? `translateY(${pullDistance}px)` : "translateY(0)",
          transition: pulling ? "none" : "transform 0.3s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}