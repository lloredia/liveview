import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News — LiveView",
  description:
    "Sports news, transfers, results, and breaking stories from top sources. Stay updated with LiveView.",
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
