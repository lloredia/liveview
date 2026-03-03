import { normalizeImageUrl } from "./normalizeImageUrl";

/**
 * Build same-origin proxy URL for news images.
 * Returns null if URL is missing or invalid after normalization.
 */
export function newsImageProxyUrl(raw: string | null | undefined): string | null {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return null;
  return `/api/image?url=${encodeURIComponent(normalized)}`;
}
