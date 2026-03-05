#!/usr/bin/env node
/**
 * Generate Sign in with Apple client secret JWT.
 *
 * Required env vars:
 *   APPLE_TEAM_ID      - Apple Developer Team ID
 *   APPLE_CLIENT_ID    - Services ID (e.g. com.liveview.tracker.web)
 *   APPLE_KEY_ID       - Key ID from the .p8 key in App Store Connect
 *   APPLE_PRIVATE_KEY  - Contents of the .p8 file (PEM), or use APPLE_PRIVATE_KEY_PATH
 *   APPLE_PRIVATE_KEY_PATH - Path to .p8 file (optional if APPLE_PRIVATE_KEY is set)
 *
 * Output: The signed JWT string to use as APPLE_SECRET in NextAuth.
 *
 * Usage:
 *   cd frontend && node scripts/gen-apple-secret.mjs
 *   # Or with env from file:
 *   export $(cat .env.apple | xargs) && node scripts/gen-apple-secret.mjs
 */

import { SignJWT, importPKCS8 } from "jose";
import { readFileSync } from "fs";

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "com.liveview.tracker.web";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
let APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY;

if (!APPLE_TEAM_ID || !APPLE_KEY_ID) {
  console.error("Error: APPLE_TEAM_ID and APPLE_KEY_ID are required.");
  process.exit(1);
}

if (!APPLE_PRIVATE_KEY && process.env.APPLE_PRIVATE_KEY_PATH) {
  try {
    APPLE_PRIVATE_KEY = readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8");
  } catch (e) {
    console.error("Error: Could not read APPLE_PRIVATE_KEY_PATH:", e.message);
    process.exit(1);
  }
}

if (!APPLE_PRIVATE_KEY) {
  console.error("Error: Set APPLE_PRIVATE_KEY (PEM string) or APPLE_PRIVATE_KEY_PATH (path to .p8 file).");
  process.exit(1);
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 180 * 24 * 60 * 60; // 180 days

  const privateKey = await importPKCS8(
    APPLE_PRIVATE_KEY.replace(/\\n/g, "\n").trim(),
    "ES256"
  );

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: APPLE_KEY_ID })
    .setIssuer(APPLE_TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setAudience("https://appleid.apple.com")
    .setSubject(APPLE_CLIENT_ID)
    .sign(privateKey);

  console.log(jwt);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
