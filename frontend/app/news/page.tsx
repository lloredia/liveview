"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/header";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { NewsBreaking } from "@/components/news/news-breaking";
import { NewsFeed } from "@/components/news/news-feed";
import { NewsHero } from "@/components/news/news-hero";

export default function NewsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(async () => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-base">
      <Header
        connected={connected}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <NewsBreaking />
      <PullToRefresh onRefresh={handleRefresh}>
        <main className="flex-1 px-3 py-4 md:px-4 md:py-6">
          <NewsHero refreshTrigger={refreshTrigger} />
          <NewsFeed refreshTrigger={refreshTrigger} />
        </main>
      </PullToRefresh>
    </div>
  );
}
