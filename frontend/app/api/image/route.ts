import { NextRequest, NextResponse } from "next/server";

/** Maximum image size: 10MB */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Blocklist: private/local hostnames (SSRF protection). Any other public HTTPS host is allowed —
 * news articles come from a long tail of CDNs (media.zenfs.com, icdn.football-italia.net,
 * s.yimg.com, etc.) and maintaining a host allowlist caused most images to 403. */
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host.length > 253) return false;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost") ||
      host === "0.0.0.0" ||
      host === "[::1]"
    ) return false;
    if (/^10\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    if (/^\[?fe80:/i.test(host) || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const decoded = decodeURIComponent(url);
  if (!isAllowedUrl(decoded)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const parsed = new URL(decoded);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const res = await fetch(decoded, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: origin + "/",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });

    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 404 });
    }

    const body = await res.arrayBuffer();

    // Enforce max image size
    if (body.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 413 });
    }
    const cacheControl = "public, s-maxage=86400, stale-while-revalidate=604800";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
