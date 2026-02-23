export const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  transfer: {
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/30",
  },
  trade: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  injury: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  draft: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
  },
  result: {
    bg: "bg-green-500/15",
    text: "text-green-400",
    border: "border-green-500/30",
  },
  streak: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  breaking: {
    bg: "bg-red-600/20",
    text: "text-red-300",
    border: "border-red-500/40",
  },
  rumor: {
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  club: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-400",
    border: "border-indigo-500/30",
  },
  analysis: {
    bg: "bg-teal-500/15",
    text: "text-teal-400",
    border: "border-teal-500/30",
  },
  general: {
    bg: "bg-gray-500/15",
    text: "text-gray-400",
    border: "border-gray-500/30",
  },
};

export const SOURCE_LOGOS: Record<string, string> = {
  ESPN: "https://a.espncdn.com/favicon.ico",
  "BBC Sport": "https://www.bbc.co.uk/favicon.ico",
  "Sky Sports": "https://www.skysports.com/favicon.ico",
  "The Guardian": "https://www.theguardian.com/favicon.ico",
  "The Guardian Football": "https://www.theguardian.com/favicon.ico",
  "The Guardian Sport": "https://www.theguardian.com/favicon.ico",
  "Bleacher Report": "https://bleacherreport.com/favicon.ico",
  "CBS Sports": "https://www.cbssports.com/favicon.ico",
  "Yahoo Sports": "https://s.yimg.com/rz/l/favicon.ico",
  Marca: "https://www.marca.com/favicon.ico",
  "Football Italia": "https://football-italia.net/favicon.ico",
  "90min": "https://www.90min.com/favicon.ico",
  Transfermarkt: "https://www.transfermarkt.com/favicon.ico",
};

export const CATEGORY_LABELS: Record<string, string> = {
  transfer: "Transfer",
  trade: "Trade",
  injury: "Injury",
  draft: "Draft",
  result: "Result",
  streak: "Streak",
  breaking: "Breaking",
  rumor: "Rumor",
  club: "Club",
  analysis: "Analysis",
  general: "General",
};
