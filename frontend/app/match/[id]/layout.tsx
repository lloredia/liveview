import type { Metadata } from "next";

import { getApiBase } from "@/lib/api";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${getApiBase()}/v1/matches/${id}/details`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Not found");
    const data = await res.json();
    const header = data.header ?? null;

    const home = header?.match?.home_team?.short_name || "Home";
    const away = header?.match?.away_team?.short_name || "Away";
    const scoreHome = header?.state?.score_home ?? 0;
    const scoreAway = header?.state?.score_away ?? 0;
    const phase = header?.match?.phase || "scheduled";
    const isLive = phase.startsWith("live_") || phase === "break";

    const title = isLive
      ? `${home} ${scoreHome}-${scoreAway} ${away} (LIVE) — LiveView`
      : phase === "finished"
        ? `${home} ${scoreHome}-${scoreAway} ${away} — LiveView`
        : `${home} vs ${away} — LiveView`;

    const description = isLive
      ? `Live: ${home} ${scoreHome}-${scoreAway} ${away}. Follow real-time updates on LiveView.`
      : phase === "finished"
        ? `Final: ${home} ${scoreHome}-${scoreAway} ${away}. Match recap on LiveView.`
        : `${home} vs ${away}. Pre-match info and live updates on LiveView.`;

    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return {
      title: "Match — LiveView",
      description: "Live sports scores and match tracking on LiveView.",
    };
  }
}

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
