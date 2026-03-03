/**
 * Normalize and validate news article image URLs.
 * Returns null for missing, invalid, or unsafe URLs.
 */

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "mc_cid", "mc_eid", "_ga",
]);

/**
 * Normalize image URL for safe use (proxy or img).
 * - missing/empty -> null
 * - force https when possible
 * - strip common tracking query params
 * - validate with URL constructor
 * - reject data: and obviously invalid
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) return null;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.hostname.length > 253) return null;

    // Block private/local
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost") ||
      host === "0.0.0.0" ||
      host === "[::1]"
    ) return null;
    if (/^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)) return null;

    // Force HTTPS for public domains
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }

    // Strip tracking params (keep others for cache busting if needed)
    TRACKING_PARAMS.forEach((p) => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return null;
  }
}
