export interface ESPNCompetitor {
  homeAway?: "home" | "away" | string;
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
    logo?: string;
  };
  leaders?: LeaderCategory[];
}

export interface ESPNEvent {
  id: string;
  competitions?: Array<{
    competitors?: ESPNCompetitor[];
    status?: {
      type?: {
        completed?: boolean;
      };
    };
  }>;
}

export interface LeaderCategory {
  displayName?: string;
  name?: string;
  leaders?: Array<{
    value?: number;
    displayValue?: string;
    athlete?: {
      displayName?: string;
      fullName?: string;
      headshot?: string;
      team?: {
        abbreviation?: string;
        logos?: Array<{ href?: string }>;
      };
    };
  }>;
}

export interface ESPNVideo {
  id?: string;
  headline?: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  duration?: number;
  images?: Array<{ url?: string }>;
  posterImages?: {
    default?: {
      href?: string;
    };
  };
  links?: {
    web?: { href?: string };
    mobile?: { href?: string };
  };
  link?: string;
}

export interface ESPNArticle {
  id?: string;
  type?: string;
  headline?: string;
  images?: Array<{ url?: string }>;
  videos?: ESPNVideo[];
  links?: {
    web?: { href?: string };
  };
}
