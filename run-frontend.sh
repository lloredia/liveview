#!/usr/bin/env bash
# Run the Next.js frontend from repo root. Fixes "too many open files" on macOS.
set -e
cd "$(dirname "$0")/frontend"
ulimit -n 10240 2>/dev/null || true
exec npm run dev
