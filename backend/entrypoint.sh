#!/bin/bash
case "$SERVICE_TYPE" in
  api)       exec python -m api.service ;;
  ingest)    exec python -m ingest.service ;;
  scheduler) exec python -m scheduler.service ;;
  builder)   exec python -m builder.service ;;
  *)         echo "Unknown SERVICE_TYPE: $SERVICE_TYPE"; exit 1 ;;
esac