# Apple App Store standards checklist — LiveView

Use this checklist so LiveView meets Apple’s App Store Review Guidelines and related requirements.

## 1. Export compliance

- **ITSAppUsesNonExemptEncryption** is set to **false** in `ios/App/App/Info.plist`.
- The app only uses standard HTTPS (exempt encryption). When submitting in App Store Connect, you can answer the export compliance questions accordingly (no proprietary encryption).

## 2. Privacy and data use

- **Privacy policy URL (required)**  
  You must provide a working privacy policy URL in App Store Connect (App Information → Privacy Policy URL). The policy should cover:
  - That the app loads web content from your server (Vercel) and may send requests to your API (Railway).
  - Use of device storage (e.g. preferences, pinned matches, theme) that does not leave the device except as part of normal API requests (e.g. auth token if you add login).
  - No sale of user data; no third‑party advertising or cross-app tracking in the current app.

- **App Privacy (App Store Connect)**  
  In App Store Connect, complete the **App Privacy** section. For LiveView:
  - **Data collection:** If you only use the app to display sports data and store preferences locally, you can indicate that you do not collect data that is linked to identity, or disclose only what you actually collect (e.g. “Data not collected” for most categories if accurate).
  - **Tracking:** The app does not use the App Tracking Transparency (ATT) framework or track users across apps/sites for advertising; answer “No” for tracking where applicable.

- **No ATT required** for the current feature set (no advertising, no cross-app tracking).

## 3. App Transport Security (ATS)

- The app loads only **HTTPS** URLs (`server.url` in `capacitor.config.ts`). Default ATS behavior is sufficient; no need to allow insecure (HTTP) connections.

## 4. Content and safety

- **Content:** The app displays sports scores and related data (from ESPN and your backend). No user-generated content, gambling, or objectionable content.
- **Age rating:** In App Store Connect, set the appropriate age rating (likely 4+ or 9+ depending on your answers). No restricted content in the current design.

## 5. Functionality and design

- **No placeholder content:** The app shows real data from your API; ensure the production API and Vercel deployment are live before submission.
- **Accessibility:** The web app includes a “Skip to content” link and allows viewport zoom (no `user-scalable=no`). Consider adding more a11y (e.g. labels, contrast) if needed for review.
- **Orientation:** Info.plist supports portrait and landscape; acceptable for a sports score app.

## 6. Metadata and listing

- **App name:** “LiveView” (or your chosen display name) in Xcode and App Store Connect.
- **Description and keywords:** Accurate, no misleading claims.
- **Screenshots:** Required for each device size you support (e.g. 6.7", 6.5", 5.5" for iPhone). Use the simulator or a device.
- **Support URL:** Provide a working support or contact URL in App Store Connect.

## 7. Technical

- **Minimum iOS version:** The Xcode project uses **IPHONEOS_DEPLOYMENT_TARGET = 16.2** (required for Live Activities). Devices on iOS 16.2+ can run the app.
- **Capabilities:** The app uses **Live Activities** (Dynamic Island / Lock Screen). No push notifications, Health, or Location. If you add other capabilities later, add the required usage descriptions in Info.plist and in App Store Connect.

## 8. Before you submit

- [ ] Privacy policy URL set in App Store Connect and linked from your site or app if needed.
- [ ] App Privacy form completed in App Store Connect.
- [ ] Export compliance answered (no non-exempt encryption).
- [ ] Screenshots and metadata filled in.
- [ ] Support URL and contact info set.
- [ ] Test the build on a real device; confirm the WebView loads your Vercel URL and the API responds (CORS allows the app).

After submission, if Apple requests a **privacy manifest** (PrivacyInfo.xcprivacy), add one to the Xcode project describing the data practices and any required-reason API use. The current app uses standard networking and storage; Capacitor may already provide or require a manifest in newer SDKs.
