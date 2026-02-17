FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shared/ shared/
COPY migrations/ migrations/

FROM base AS ingest
COPY ingest/ ingest/
EXPOSE 9091
CMD ["python", "-m", "ingest.service"]

FROM base AS scheduler
COPY scheduler/ scheduler/
COPY ingest/providers/ ingest/providers/
EXPOSE 9092
CMD ["python", "-m", "scheduler.service"]

FROM base AS builder
COPY builder/ builder/
EXPOSE 9093
CMD ["python", "-m", "builder.service"]

FROM base AS api
COPY api/ api/
COPY auth_routes.py .
EXPOSE 8000 9090
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
CMD ["python", "-m", "api.service"]