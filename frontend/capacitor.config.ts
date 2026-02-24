import type { CapacitorConfig } from "@capacitor/cli";

/**
 * LiveView iOS app (App Store).
 * The app loads your deployed Vercel URL so it always shows the latest frontend.
 * Override: set NEXT_PUBLIC_APP_URL in .env.local or export before cap sync.
 */
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://frontend-lloredias-projects.vercel.app";

const config: CapacitorConfig = {
  appId: "com.liveview.tracker",
  appName: "LiveView",
  webDir: "public",
  server: {
    url: appUrl,
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
