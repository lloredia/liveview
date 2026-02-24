#!/bin/sh
# Run from this repo root (liveview-app) so GitHub gets the frontend/ layout.
set -e
cd "$(dirname "$0")"
echo "Pushing from: $(pwd)"
git status --short
git push origin main
echo "Done. Refresh GitHub to see frontend/ and backend/."
