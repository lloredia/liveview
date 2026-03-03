import { normalizeImageUrl } from "@/lib/news/normalizeImageUrl";

describe("normalizeImageUrl", () => {
  it("returns null for missing or empty", () => {
    expect(normalizeImageUrl(null)).toBeNull();
    expect(normalizeImageUrl(undefined)).toBeNull();
    expect(normalizeImageUrl("")).toBeNull();
    expect(normalizeImageUrl("   ")).toBeNull();
  });

  it("returns null for data: URLs", () => {
    expect(normalizeImageUrl("data:image/png;base64,abc")).toBeNull();
    expect(normalizeImageUrl("data:image/gif;base64,xyz")).toBeNull();
  });

  it("returns null for non-http(s) URLs", () => {
    expect(normalizeImageUrl("ftp://example.com/img.jpg")).toBeNull();
    expect(normalizeImageUrl("file:///tmp/img.jpg")).toBeNull();
    expect(normalizeImageUrl("javascript:alert(1)")).toBeNull();
  });

  it("forces HTTPS", () => {
    expect(normalizeImageUrl("http://example.com/pic.jpg")).toBe(
      "https://example.com/pic.jpg"
    );
    expect(normalizeImageUrl("https://cdn.example.com/pic.jpg")).toBe(
      "https://cdn.example.com/pic.jpg"
    );
  });

  it("strips tracking params", () => {
    const url = "https://example.com/img.jpg?utm_source=foo&utm_medium=bar&w=400";
    const out = normalizeImageUrl(url);
    expect(out).toContain("https://example.com/img.jpg");
    expect(out).not.toContain("utm_source");
    expect(out).not.toContain("utm_medium");
    expect(out).toContain("w=400");
  });

  it("rejects private/local hostnames", () => {
    expect(normalizeImageUrl("https://localhost/img.jpg")).toBeNull();
    expect(normalizeImageUrl("https://127.0.0.1/img.jpg")).toBeNull();
    expect(normalizeImageUrl("https://10.0.0.1/img.jpg")).toBeNull();
    expect(normalizeImageUrl("https://172.16.0.1/img.jpg")).toBeNull();
    expect(normalizeImageUrl("https://169.254.1.1/img.jpg")).toBeNull();
  });

  it("accepts valid public URLs", () => {
    expect(normalizeImageUrl("https://a.espncdn.com/photo.jpg")).toBe(
      "https://a.espncdn.com/photo.jpg"
    );
    expect(normalizeImageUrl("  https://ichef.bbci.co.uk/news/1024/cpsprodpb/123.jpg  ")).toBe(
      "https://ichef.bbci.co.uk/news/1024/cpsprodpb/123.jpg"
    );
  });

  it("returns null for invalid URL format", () => {
    expect(normalizeImageUrl("not-a-url")).toBeNull();
    expect(normalizeImageUrl("https://")).toBeNull();
  });
});
