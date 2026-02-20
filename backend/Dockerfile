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

COPY . .

RUN chmod +x entrypoint.sh

FROM base AS ingest
ENV SERVICE_TYPE=ingest
EXPOSE 9091
CMD ["./entrypoint.sh"]

FROM base AS scheduler
ENV SERVICE_TYPE=scheduler
EXPOSE 9092
CMD ["./entrypoint.sh"]

FROM base AS builder
ENV SERVICE_TYPE=builder
EXPOSE 9093
CMD ["./entrypoint.sh"]

# Default target for Railway / single-service deploy (must be last)
FROM base AS api
ENV SERVICE_TYPE=api
EXPOSE 8000
CMD ["./entrypoint.sh"]