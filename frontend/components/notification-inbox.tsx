"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchInbox,
  markNotificationsRead,
  type InboxItem,
} from "@/lib/notification-api";
import { getDeviceId } from "@/lib/device";
import { GlassPill } from "./ui/glass";
import { EventIcon } from "./ui/icons";

interface NotificationInboxProps {
  className?: string;
}

export function NotificationInbox({ className = "" }: NotificationInboxProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!getDeviceId()) return;
    setLoading(true);
    try {
      const data = await fetchInbox(30);
      setItems(data.items);
      setUnreadCount(data.unread_count);
    } catch {
      // Silently fail — inbox is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for unread count every 30s
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open) {
      await load();
    }
  };

  const handleItemClick = async (item: InboxItem) => {
    if (!item.is_read) {
      await markNotificationsRead([item.id]);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    const url =
      typeof item.data?.url === "string" ? item.data.url : `/match/${item.game_id}`;
    router.push(url);
  };

  const handleMarkAllRead = async () => {
    await markNotificationsRead(undefined, true);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnreadCount(0);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const renderEventIcon = (type: string) => {
    // Map notification event types to SVG icons
    const iconType: Record<string, string> = {
      score_update: "goal",
      lead_change: "substitution",
      game_start: "match_start",
      halftime: "halftime",
      overtime_start: "goal",
      final: "match_end",
      major_event: "goal",
    };
    return <EventIcon type={iconType[type] ?? "match_start"} size={14} className="text-text-secondary" />;
  };

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell button with badge */}
      <button
        onClick={handleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-[10px] text-text-muted transition-colors glass-press hover:bg-glass-hover hover:text-text-primary"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 text-[8px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 z-[100] w-[340px] max-h-[420px] overflow-hidden rounded-[16px] glass-surface-prominent glass-blur border border-glass-border shadow-glass-lg animate-glass-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
            <h3 className="text-body-sm font-bold text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-label-sm text-accent-blue hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="py-8 text-center text-label-md text-text-muted">
                No notifications yet
              </div>
            )}

            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`
                  flex w-full items-start gap-3 px-4 py-3 text-left transition-colors
                  hover:bg-glass-hover glass-press
                  ${!item.is_read ? "bg-accent-blue/[0.03]" : ""}
                  border-b border-glass-border-light last:border-b-0
                `}
              >
                <span className="mt-0.5 leading-none">
                  {renderEventIcon(item.event_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-body-sm ${!item.is_read ? "font-bold text-text-primary" : "text-text-secondary"}`}>
                      {item.title}
                    </span>
                    {!item.is_read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-label-md text-text-muted">
                    {item.body}
                  </p>
                </div>
                <span className="shrink-0 text-label-xs text-text-dim">
                  {timeAgo(item.created_at)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
