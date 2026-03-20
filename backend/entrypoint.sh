#!/bin/bash
set -e

should_run_migrations="false"
case "${RUN_MIGRATIONS_ON_START:-}" in
  true|TRUE|1|yes|YES)
    should_run_migrations="true"
    ;;
  false|FALSE|0|no|NO)
    should_run_migrations="false"
    ;;
  *)
    if [ "${SERVICE_TYPE}" = "api" ]; then
      should_run_migrations="true"
    fi
    ;;
esac

if [ "${should_run_migrations}" = "true" ]; then
  echo "Running database migrations..."
  python run_migrations.py
else
  echo "Skipping database migrations for SERVICE_TYPE=${SERVICE_TYPE}"
fi

case "$SERVICE_TYPE" in
  api)       exec python -m api.service ;;
  ingest)    exec python -m ingest.service ;;
  scheduler) exec python -m scheduler.service ;;
  builder)   exec python -m builder.service ;;
  verifier)  exec python -m verifier.main ;;
  *)         echo "Unknown SERVICE_TYPE: $SERVICE_TYPE"; exit 1 ;;
esac
