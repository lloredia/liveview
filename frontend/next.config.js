const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      // Cache API responses for 10 seconds (stale-while-revalidate)
      urlPattern: /^https?:\/\/.*\/v1\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 64, maxAgeSeconds: 10 },
        networkTimeoutSeconds: 5,
      },
    },
    {
      // Cache team logo images aggressively
      urlPattern: /^https:\/\/a\.espncdn\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "logo-cache",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      // Cache Google Fonts
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "font-cache",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com", pathname: "/**" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/v1/ws",
  },
  async rewrites() {
    return [
      { source: "/robots.txt", destination: "/api/robots" },
      { source: "/sitemap.xml", destination: "/api/sitemap" },
      {
        source: "/api/espn/v2/:path*",
        destination: "https://site.api.espn.com/apis/v2/sports/:path*",
      },
      {
        source: "/api/espn/site/:path*",
        destination: "https://site.api.espn.com/apis/site/v2/sports/:path*",
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
