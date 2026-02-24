# Publishing LiveView to the Apple App Store

The iOS app is a **native shell** (Capacitor) that loads your deployed LiveView frontend (Vercel). No static export or embedded build is required; the app always shows the latest version.

## Prerequisites

- **Apple Developer Program** membership ($99/year) — [developer.apple.com](https://developer.apple.com)
- **Xcode** (latest) from the Mac App Store
- **Node.js 18+** and npm
- Your LiveView frontend deployed (e.g. Vercel) and backend (e.g. Railway) live

## 1. Install dependencies and add iOS

From the repo root:

```bash
cd frontend
npm install
npm run cap:add:ios
```

This creates the `ios/` directory with the Xcode project. Commit `ios/` if you want it in the repo.

## 2. Configure the app URL

The app loads your production frontend URL. In `frontend/capacitor.config.ts` the default is:

- `https://frontend-lloredias-projects.vercel.app`

To use a different URL (e.g. your own Vercel URL), either:

- Set **NEXT_PUBLIC_APP_URL** in `frontend/.env.local`, then run `npm run cap:sync`, or  
- Edit `capacitor.config.ts` and set `server.url` to your URL, then run `npm run cap:sync`.

Your frontend must use the **production API URL** (e.g. Railway) when loaded in the app — set **NEXT_PUBLIC_API_URL** in your Vercel environment to your Railway API URL.

## 3. Open in Xcode and set signing

```bash
cd frontend
npm run cap:open:ios
```

In Xcode:

1. Select the **App** target and open **Signing & Capabilities**.
2. Choose your **Team** (Apple Developer account).
3. Set **Bundle Identifier** (e.g. `com.yourcompany.liveview` or keep `com.liveview.tracker`).
4. Ensure **Automatically manage signing** is checked.

## 4. Icons and display name (optional)

- **App icon:** Replace assets in `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with your 1024×1024 icon and generated sizes, or use Xcode’s single-asset app icon with the 1024px image.
- **Display name:** In the App target → **General** → **Display Name** (e.g. “LiveView”).

## 5. Build and run on a device

Connect an iPhone or choose a simulator. Select the **App** scheme and run (⌘R). The app should open and load your Vercel URL.

## 6. Archive and submit to App Store Connect

1. In Xcode, select **Any iOS Device (arm64)** as the run destination.
2. **Product** → **Archive**.
3. When the Organizer appears, click **Distribute App**.
4. Choose **App Store Connect** → **Upload** and follow the steps (signing, options).
5. In [App Store Connect](https://appstoreconnect.apple.com), create the app if needed, fill in metadata (description, screenshots, privacy policy URL, etc.), attach the build from the upload, and submit for review.

## 7. After submission

- **CORS:** Your Railway API must allow requests from the app. Add your app’s URL scheme or origin to **LV_CORS_ORIGINS** if you use origin checks; Capacitor’s WebView may use a custom scheme (e.g. `capacitor://localhost`). If your API allows `*` or the Vercel domain, the in-app WebView loading the Vercel site usually works.
- **Updates:** Because the app loads the live URL, frontend updates (Vercel deploys) go live for users without an app store update. You only need to resubmit a new build if you change native config (e.g. bundle ID, capabilities, or Capacitor plugins).

## Troubleshooting

- **White screen / won’t load:** Confirm `server.url` in `capacitor.config.ts` is correct and the URL is reachable (HTTPS). Check the Vercel deployment and that **NEXT_PUBLIC_API_URL** points to the Railway API.
- **“Untrusted Enterprise Developer”:** On a real device, go to **Settings → General → VPN & Device Management** and trust your developer certificate.
- **Capacitor sync:** After changing `capacitor.config.ts` or adding plugins, run `npm run cap:sync` in `frontend/`.
