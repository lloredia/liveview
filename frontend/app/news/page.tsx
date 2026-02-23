"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { NewsBreaking } from "@/components/news/news-breaking";
import { NewsFeed } from "@/components/news/news-feed";
import { NewsHero } from "@/components/news/news-hero";

export default function NewsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected] = useState(true);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-base">
      <Header
        connected={connected}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <NewsBreaking />
      <main className="flex-1 px-3 py-4 md:px-4 md:py-6">
        <NewsHero />
        <NewsFeed />
      </main>
    </div>
  );
}
