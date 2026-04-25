# Mobile build & submit (Expo / EAS)

Replaces the Capacitor + Xcode + Organizer path. Three commands now.

## One-time setup

```bash
cd mobile
npm install -g eas-cli         # if you don't have it
eas login                      # uses your Expo / Apple credentials
eas init                       # creates the EAS project, fills app.json eas.projectId
```

Then **fill in `ascAppId`** in `eas.json` once: it's the App Store Connect
"Apple ID" (numeric) for the LiveView app — visible at
https://appstoreconnect.apple.com → My Apps → LiveView → App Information →
General Information → "Apple ID".

## Daily flow

```bash
# Local dev
npx expo start                 # press i for simulator, w for web

# Production iOS build (cloud-built on EAS, ~10–15 min)
eas build --platform ios --profile production

# Submit the most recent build to App Store Connect
eas submit --platform ios --latest
```

That's the whole loop — no Xcode, no archive.sh, no Organizer, no signing
dance. EAS handles signing certificates automatically (it'll ask for your
Apple ID + 2FA code on first build).

## Build numbers

`autoIncrement: true` in the production profile means EAS bumps
`buildNumber` automatically every build. Marketing version (`version`
in app.json) you bump manually when you want a new App Store version.

## Resubmitting after a rejection

```bash
# Bump marketing version in app.json (e.g. 2.1.0 → 2.1.1)
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Then in App Store Connect → add the new build to your existing /
rejected submission, or create a new version.
