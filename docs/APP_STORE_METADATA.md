# App Store Connect — Metadata & checklist

Use this when filling out your app listing in [App Store Connect](https://appstoreconnect.apple.com). Replace placeholders (e.g. your Vercel URL, support email) before submitting.

---

## 1. Privacy Policy URL (required)

**URL to use:** `https://YOUR_VERCEL_DOMAIN/privacy`

Example: `https://frontend-lloredias-projects.vercel.app/privacy`

- The app includes a **Privacy** page at `/privacy` that covers:
  - Web content and API usage
  - That you don’t collect identifying personal data
  - That you don’t sell user data
- Deploy the frontend (e.g. push to Vercel), then paste the live URL in App Store Connect → App Information → **Privacy Policy URL**.

---

## 2. Support URL (required)

**URL to use:** `https://YOUR_VERCEL_DOMAIN/support`

Example: `https://frontend-lloredias-projects.vercel.app/support`

- The app includes a **Support** page at `/support` with contact info.
- **Before submit:** Edit `frontend/app/support/page.tsx` and set the support email (e.g. `support@yourdomain.com`) to your real address.
- Paste the live Support URL in App Store Connect → App Information → **Support URL**.

---

## 3. App Privacy (required)

In App Store Connect → your app → **App Privacy** → **Get Started** (or Edit):

- **Do you or your third‑party partners collect data from this app?**  
  → **No** (if you truly don’t collect identifiable data), or **Yes** and add only what you collect.

If **No**:

- Answer the flow so that it’s clear you don’t collect data linked to identity.
- You may still need to confirm “Data not collected” for categories.

If you **do** collect something (e.g. email for support):

- Add only the relevant data types (e.g. Contact Info → Email).
- Purpose: e.g. “App functionality” or “Support”.
- **Tracking:** The app does **not** use the App Tracking Transparency framework or track users across apps/sites for advertising → answer **No** for tracking where applicable.

---

## 4. Screenshots (required)

You need **at least one screenshot per device size** you support. Common iPhone sizes:

| Device size | Resolution (points) | Example device |
|-------------|---------------------|----------------|
| 6.7"       | 1290 × 2796         | iPhone 15 Pro Max, 16 Pro Max |
| 6.5"       | 1242 × 2688         | iPhone 11 Pro Max, XS Max |
| 5.5"       | 1242 × 2208         | iPhone 8 Plus |

**How to capture:**

1. In Xcode, run the **App** scheme on the **simulator** (e.g. iPhone 16 Pro Max for 6.7").
2. Open the app and go to a screen that looks good (e.g. live scores, Dynamic Island visible if possible).
3. **File → New Screen** in Simulator, or **⌘S** to save a screenshot (saves to Desktop).
4. Or: **Simulator → File → Save Screen** (or drag the simulator window and use **⌘S**).
5. Repeat for other sizes (e.g. iPhone 14 Plus for 6.5", iPhone 8 Plus for 5.5").

**Tips:**

- Use “Export for App Store” or the exact pixel sizes Apple expects (see App Store Connect for each slot).
- No status bar text that says “Carrier” or “Simulator” if you can avoid it; clean status bar is better.
- You can use the same screenshot for multiple sizes if you resize/crop to the required dimensions.

---

## 5. Description (copy‑paste draft)

**Subtitle (30 characters max):**  
`Live scores. Tracked.`

**Promotional text (170 characters, editable anytime):**  
`Track live sports scores and follow your favorite games. Real-time updates, multiple leagues, and Dynamic Island support on supported iPhones.`

**Description (4000 characters max):**  

```
LiveView keeps you on top of live sports. Follow scores in real time across soccer, basketball, hockey, and baseball.

• Live scores and match timelines
• Track up to 10 games and see them in the Dynamic Island (iPhone 14 Pro and later) and Lock Screen
• News and game previews
• Dark and light themes

No account required to browse. Data is not sold. Your preferences stay on your device.

Requires iOS 16.2 or later.
```

Adjust wording to match your app (e.g. league names, features).

---

## 6. Keywords

**100 characters max, comma‑separated, no spaces after commas.**  
Example:

```
sports,scores,live,soccer,basketball,hockey,baseball,tracker,ESPN,sports scores,live scores
```

Add or remove terms based on what you want to be found for.

---

## 7. Age rating

In App Store Connect → **Age Rating** → complete the questionnaire.

- **No** to: Gambling, Unrestricted Web Access, User-Generated Content (if you have none), etc.
- Typical result: **4+** or **9+** for a sports score app with no mature content.

---

## 8. Before you submit — quick checklist

- [ ] **Privacy Policy URL** — Live URL to `https://YOUR_DOMAIN/privacy`
- [ ] **Support URL** — Live URL to `https://YOUR_DOMAIN/support` (and support email updated in `/support` page)
- [ ] **App Privacy** — Form completed (e.g. “Data not collected” or only what you collect; no tracking)
- [ ] **Screenshots** — At least one per required device size (e.g. 6.7", 6.5", 5.5")
- [ ] **Description, subtitle, keywords** — Filled in (use draft above or adapt)
- [ ] **Age rating** — Questionnaire done (likely 4+ or 9+)
- [ ] **Build** — Uploaded from Xcode and selected for the version you’re submitting
