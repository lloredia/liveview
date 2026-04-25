import { Circle, CircleDot, Goal, type LucideIcon } from "lucide-react-native";

interface SportIconProps {
  sport: string;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/**
 * Sport icon using lucide. Picks a glyph that reads as that sport's
 * ball/play. Falls back to a generic circle for unknown sports.
 *
 * Lucide doesn't have first-class sport balls, so:
 * - soccer    → Goal (net silhouette reads as soccer)
 * - basketball→ CircleDot (round, two-tone)
 * - baseball  → CircleDot
 * - hockey    → Circle (puck silhouette)
 * - football  → Goal (American football post)
 */
const ICONS: Record<string, LucideIcon> = {
  soccer: Goal,
  basketball: CircleDot,
  baseball: CircleDot,
  hockey: Circle,
  football: Goal,
  "american-football": Goal,
};

export function SportIcon({ sport, size = 14, color, strokeWidth = 2 }: SportIconProps) {
  const key = (sport || "").toLowerCase().trim();
  const Icon = ICONS[key] ?? Circle;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
