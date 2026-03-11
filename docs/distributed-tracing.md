# Distributed Tracing with OpenTelemetry + Jaeger

## Overview

Distributed tracing provides end-to-end visibility into requests as they flow through your microservices architecture. LiveView uses **OpenTelemetry** to collect traces and **Jaeger** to store and visualize them.

**What you get:**
- Cross-service request tracking (e.g., API → Ingest → Database)
- Performance bottleneck identification
- Error latency analysis
- Dependency visualization

**Affected Services:**
- API (FastAPI)
- Ingest (polling service)
- Scheduler (match orchestration)
- Builder (timeline generation)

---

## Architecture

```
┌─────────────────────────────┐
│   Application (API/Ingest)  │
│  OpenTelemetry Exporters    │
└──────────────┬──────────────┘
               │
               ▼ (Thrift/UDP 6831 or gRPC)
        ┌──────────────┐
        │    Jaeger    │
        │   Collector  │
        └──────┬───────┘
               │
               ▼
        ┌──────────────────┐
        │  Jaeger Storage  │  📊 Jaeger UI: http://localhost:16686
        │  (In-Memory)     │
        └──────────────────┘
```

---

## Quick Start

### 1. Start Jaeger

```bash
cd backend
docker-compose up jaeger
# Jaeger UI: http://localhost:16686
```

### 2. Start Services with Tracing Enabled

```bash
docker-compose up api ingest scheduler builder
```

All services automatically export traces to Jaeger (enabled by default in docker-compose.yml).

### 3. Generate Traces

```bash
# Make API requests to generate traces
curl http://localhost:8000/v1/leagues

# View in Jaeger UI
# http://localhost:16686 → Select "liveview-api" service
```

---

## Implementation Details

### Backend Configuration

**Environment Variables:**
```bash
OTEL_ENABLED=true                      # Enable/disable tracing
OTEL_SERVICE_NAME=liveview-api        # Service name in traces
OTEL_JAEGER_AGENT_HOST=localhost      # Jaeger agent hostname
OTEL_JAEGER_AGENT_PORT=6831           # Jaeger agent port (UDP)
OTEL_TRACES_SAMPLE_RATE=0.1           # Sample 10% of requests in production, 100% in dev
```

### Initialization

**File:** `backend/shared/tracing.py`

```python
from shared.tracing import init_tracing, shutdown_tracing, get_tracer

# In app.py startup
async def lifespan(app: FastAPI):
    init_tracing()  # Initialize OpenTelemetry
    # ... startup code ...
    yield
    shutdown_tracing()  # Flush pending traces
```

### Automatic Instrumentation

OpenTelemetry automatically instruments:
- **FastAPI:** Request/response spans
- **SQLAlchemy:** Database queries (with SQL captured in span tags)
- **httpx:** Outbound HTTP calls (to ESPN, Football-Data APIs)
- **Redis:** Cache/pub-sub operations

```python
# All of these are automatically traced:
async with db.session() as session:
    league = await session.get(LeagueORM, league_id)  # Traced

async with httpx.AsyncClient() as client:
    response = await client.get("https://api.espn.com/...")  # Traced

redis.client.set("key", "value")  # Traced
```

### Custom Spans

Add custom spans for business logic:

```python
from shared.tracing import get_tracer

tracer = get_tracer("api.routes.matches")

def process_match_update(match_id: UUID, data: dict):
    with tracer.start_as_current_span("process_match_update") as span:
        span.set_attribute("match_id", str(match_id))
        span.set_attribute("status", data.get("status"))
        
        # Your code here
        # Span automatically tracks duration
```

### Trace Context Propagation

Request IDs are automatically propagated:

```
Request → API (trace_id: abc123)
           ├→ Database query (same trace_id)
           ├→ Redis operation (same trace_id)
           └→ HTTP to ESPN API (same trace_id)
                └→ Response logged with trace_id
```

---

## Jaeger UI

### Access

Open http://localhost:16686 in your browser.

### Key Features

**1. Service Selection**
- Left panel: Select service (liveview-api, ingest, scheduler, builder)
- View all traces for that service

**2. Trace Search**
- Filter by:
  - Service
  - Operation (e.g., "GET /v1/leagues")
  - Duration
  - Tags (custom attributes)
  - Status (success/error)

**3. Trace Details**
- Timeline view showing all spans
- Span duration and timestamps
- Operation names and service names
- Logs (errors, warnings)
- Tags (attributes set in code)

**4. Service Topology**
- View all service dependencies
- See call patterns between services
- Identify bottlenecks

### Common Queries

**Find slow requests:**
```
Service: liveview-api
Operation: GET /v1/matches
Min Duration: 1000ms
```

**Find errors:**
```
Service: liveview-api
Status: Error
```

**Trace a specific match:**
```
Service: liveview-api
Tags: match_id=<uuid>
```

---

## Best Practices

### 1. Set Meaningful Attributes

```python
with tracer.start_as_current_span("fetch_league") as span:
    span.set_attribute("league_id", str(league_id))
    span.set_attribute("provider", "espn")
    span.set_attribute("cache_hit", True)
    span.set_attribute("latency_ms", 123)
```

→ Makes traces searchable and debuggable in Jaeger UI

### 2. Record Errors

```python
try:
    await fetch_from_api()
except Exception as e:
    span.record_exception(e)
    span.set_attribute("error", True)
    raise
```

### 3. Use Sampling for Production

```bash
# Development: 100% sampling (see all traces)
OTEL_TRACES_SAMPLE_RATE=1.0

# Production: 10% sampling (reduce overhead)
OTEL_TRACES_SAMPLE_RATE=0.1
```

### 4. Batch Processing

Jaeger exporter batches spans to reduce network overhead:
- Default batch size: 64 spans
- Default timeout: 5 seconds
- Configurable via environment variables

### 5. Privacy

Don't trace sensitive data:

```python
# ❌ DON'T: Sensitive data in attributes
span.set_attribute("api_key", settings.espn_api_key)

# ✅ DO: Only trace non-sensitive data
span.set_attribute("api_provider", "espn")
span.set_attribute("endpoint", "/sports/soccer/")
```

---

## Troubleshooting

### Traces Not Appearing

1. **Check OTEL_ENABLED:**
   ```bash
   echo $OTEL_ENABLED  # Should be "true"
   ```

2. **Check Jaeger Connectivity:**
   ```bash
   docker logs jaeger
   # Should show "listening on :6831 (UDP)"
   ```

3. **Check Service Name:**
   ```bash
   # In Jaeger UI, check dropdown for your service name
   # Default: liveview-api
   ```

4. **Verify Application Logs:**
   ```bash
   docker logs api
   # Should show "✓ OpenTelemetry initialized: liveview-api → Jaeger"
   ```

### High Trace Volume

**Reduce sampling rate:**
```bash
OTEL_TRACES_SAMPLE_RATE=0.01  # 1% of requests
```

**Filter in docker-compose.yml:**
```yaml
jaeger:
  environment:
    SAMPLING_STRATEGIES_FILE: /etc/jaeger/sampling.json
```

### Large Spans

**Limit SQL capture:**
```python
SQLAlchemyInstrumentor().instrument(
    enable_commenter=False,  # Don't include SQL in span tags
)
```

---

## Production Deployment

### Railway Setup

1. **Create Jaeger instance:**
   - Railway UI → New Service → Docker image: `jaegertracing/all-in-one:latest`

2. **Set environment variables on services:**
   ```bash
   OTEL_ENABLED=true
   OTEL_JAEGER_AGENT_HOST=<jaeger-hostname-from-railway>
   OTEL_JAEGER_AGENT_PORT=6831
   OTEL_TRACES_SAMPLE_RATE=0.1
   ```

3. **Access Jaeger UI:**
   - Railway provides public URL for Jaeger (port 16686)

### Vercel (Frontend)

Frontend doesn't need Jaeger for now (JavaScript SDK is separate):
```bash
npm install @opentelemetry/api @opentelemetry/sdk-web
# (Optional, for future frontend tracing)
```

---

## Advanced: Custom Spans in Routes

```python
from fastapi import APIRouter, Depends
from shared.tracing import get_tracer
from datetime import UUID

router = APIRouter()
tracer = get_tracer("api.routes.matches")

@router.get("/matches/{match_id}")
async def get_match(match_id: UUID):
    """Get a single match with tracing."""
    with tracer.start_as_current_span("get_match") as span:
        span.set_attribute("match_id", str(match_id))
        
        # Database query (auto-traced)
        match = await db.get_match(match_id)
        
        # Cache lookup (auto-traced)
        cached_events = await redis.get_events(match_id)
        
        # Custom attribute for business logic
        span.set_attribute("has_cache", cached_events is not None)
        span.set_attribute("match_phase", match.phase if match else None)
        
        return match
```

---

## Monitoring Traces

### Metrics from Tracing

Convert traces to metrics:

```python
@app.get("/metrics")
async def metrics():
    # Can add custom metrics from trace data
    return prometheus_format()
```

### Setting Alerts

Alert on:
- Traces with errors
- Slow operations (>1s)
- Service unavailability

---

## References

- [OpenTelemetry Docs](https://opentelemetry.io/)
- [OpenTelemetry Python](https://github.com/open-telemetry/opentelemetry-python)
- [Jaeger Docs](https://www.jaegertracing.io/)
- [Instrumentations](https://opentelemetry.io/docs/instrumentation/python/automatic/)

---

## Next Steps

1. **Enable in development:** `docker-compose up`
2. **Instrument custom spans:** Add to critical paths
3. **Monitor in production:** Set up alerting
4. **Frontend tracing:** (Future) Add @opentelemetry/sdk-web
5. **Logs correlation:** Correlate traces with LogStash/ELK

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [sentry-setup.md](sentry-setup.md) - Error tracking
- [monitoring-and-alerts.md](monitoring-and-alerts.md) - Alerting strategy

