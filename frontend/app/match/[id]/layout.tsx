import type { Metadata } from "next";

import { getApiBase } from "@/lib/api";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${getApiBase()}/v1/matches/${id}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error("Not found");
    const data = await res.json();

    const home = data.match?.home_team?.short_name || "Home";
    const away = data.match?.away_team?.short_name || "Away";
    const scoreHome = data.state?.score_home ?? 0;
    const scoreAway = data.state?.score_away ?? 0;
    const phase = data.match?.phase || "scheduled";
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
