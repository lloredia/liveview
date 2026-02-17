#!/usr/bin/env bash
# Runs seed.py inside the API container to refresh matches.
# Schedule with crontab: 0 */6 * * * /path/to/liveview/cron-seed.sh >> /var/log/liveview-seed.log 2>&1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Starting seed refresh..."

docker compose cp seed.py api:/app/seed.py
MSYS_NO_PATHCONV=1 docker compose exec -T -w /app api python seed.py

echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Seed refresh complete."