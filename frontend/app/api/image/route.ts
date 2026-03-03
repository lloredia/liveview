import { NextRequest, NextResponse } from "next/server";

/** Blocklist: private/local hostnames (SSRF protection). Allow all other public hostnames. */
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
    const res = await fetch(decoded, {
      headers: {
        "User-Agent": "LiveView-News/1.0 (Image Proxy)",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(10_000),
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
