"use client";

import { useCallback, useState } from "react";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { NewsBreaking } from "@/components/news/news-breaking";
import { NewsFeed } from "@/components/news/news-feed";
import { NewsReadingProgress } from "@/components/news/news-reading-progress";

export default function NewsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(async () => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <NewsReadingProgress />
      <NewsBreaking />
      <PullToRefresh onRefresh={handleRefresh}>
        <NewsFeed refreshTrigger={refreshTrigger} />
      </PullToRefresh>
    </div>
  );
}
