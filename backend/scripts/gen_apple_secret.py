#!/usr/bin/env python3
"""
Generate Sign in with Apple client secret JWT.

Required env vars:
  APPLE_TEAM_ID      - Apple Developer Team ID
  APPLE_CLIENT_ID    - Services ID (e.g. com.liveview.tracker.web)
  APPLE_KEY_ID       - Key ID from the .p8 key in App Store Connect
  APPLE_PRIVATE_KEY  - Contents of the .p8 file (PEM), or use APPLE_PRIVATE_KEY_PATH
  APPLE_PRIVATE_KEY_PATH - Path to .p8 file (optional if APPLE_PRIVATE_KEY is set)

Output: The signed JWT string to use as APPLE_SECRET in NextAuth.

Usage:
  cd backend && python scripts/gen_apple_secret.py
  # Or with env from file:
  export $(cat .env.apple | xargs) && python scripts/gen_apple_secret.py
"""
from __future__ import annotations

import os
import sys
import time

import jwt

APPLE_TEAM_ID = os.environ.get("APPLE_TEAM_ID")
APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID", "com.liveview.tracker.web")
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY")
APPLE_PRIVATE_KEY_PATH = os.environ.get("APPLE_PRIVATE_KEY_PATH")

if not APPLE_TEAM_ID or not APPLE_KEY_ID:
    print("Error: APPLE_TEAM_ID and APPLE_KEY_ID are required.", file=sys.stderr)
    sys.exit(1)

if not APPLE_PRIVATE_KEY and APPLE_PRIVATE_KEY_PATH:
    try:
        with open(APPLE_PRIVATE_KEY_PATH, encoding="utf-8") as f:
            APPLE_PRIVATE_KEY = f.read()
    except OSError as e:
        print(f"Error: Could not read APPLE_PRIVATE_KEY_PATH: {e}", file=sys.stderr)
        sys.exit(1)

if not APPLE_PRIVATE_KEY:
    print(
        "Error: Set APPLE_PRIVATE_KEY (PEM string) or APPLE_PRIVATE_KEY_PATH (path to .p8 file).",
        file=sys.stderr,
    )
    sys.exit(1)

# Normalize newlines (e.g. from env)
APPLE_PRIVATE_KEY = APPLE_PRIVATE_KEY.replace("\\n", "\n").strip()

now = int(time.time())
exp = now + (180 * 24 * 60 * 60)  # 180 days

headers = {"alg": "ES256", "kid": APPLE_KEY_ID}
payload = {
    "iss": APPLE_TEAM_ID,
    "iat": now,
    "exp": exp,
    "aud": "https://appleid.apple.com",
    "sub": APPLE_CLIENT_ID,
}

try:
    token = jwt.encode(
        payload,
        APPLE_PRIVATE_KEY,
        algorithm="ES256",
        headers=headers,
    )
    print(token)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
