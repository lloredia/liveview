# Blue-Green Deployment Strategy

## Overview

Blue-Green deployment enables **zero-downtime updates** by running two identical production environments:

- **Blue** (Current): Serves all production traffic
- **Green** (New): Receives updated code, validated first
- **Switch** (Deployment): Traffic routed to Green only after validation

**Benefits:**
- ✅ Zero downtime
- ✅ Instant rollback (route back to Blue)
- ✅ Full validation before traffic switch
- ✅ No gradual rollout issues

**Tradeoffs:**
- ❌ 2x infrastructure cost during deployment (~15-30 minutes)
- ❌ More complex operational procedures
- ❌ Database migrations require careful handling

---

## Architecture

### Current State (Single Environment)

```
┌─────────────────────────┐
│  Production (Railway)   │
│  - API                  │
│  - Ingest               │
│  - Scheduler            │
│  - Builder              │
│  - Database             │
│  - Redis                │
└─────────────────────────┘
        ▲
        │
     Traffic
        │
    ┌───┴───┐
    │Client│
    └───┬───┘
```

### Blue-Green Setup

```
                     Load Balancer (DNS/Router)
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
            ┌──────────────┐    ┌──────────────┐
            │  BLUE (Old)  │    │ GREEN (New)  │
            │              │    │              │
            │ - API        │    │ - API        │
            │ - Ingest     │    │ - Ingest     │
            │ - Scheduler  │    │ - Scheduler  │
            │ - Builder    │    │ - Builder    │
            └──────────────┘    └──────────────┘
                    ▲                   │
                    │                   │
            Active Traffic       Validating...
                                (not live yet)

Database: Shared (PostgreSQL)
Redis: Shared (single instance)
```

---

## Deployment Process

### Phase 1: Pre-Deployment (5 minutes)

1. **Code Review & Tests Pass**
   ```bash
   # CI/CD pipeline runs:
   - pytest backend/ --cov
   - npm test frontend/
   - Playwright E2E tests
   - Security scanning (OWASP)
   ```

2. **Build Artifacts**
   ```bash
   # Docker images built
   docker build -t liveview-api:v1.2.0 backend/
   docker push registry.railway.app/liveview-api:v1.2.0
   ```

3. **Prepare Green Environment**
   - Create new service instances on Railway
   - Mount same database/Redis
   - Pull Docker image

### Phase 2: Green Deployment (10-15 minutes)

```
BLUE                    GREEN (new)
✓ Live Traffic          Deploying...
✓ Handling requests     Docker pull
✓ 0 errors             Initializing
                        Running migrations (if needed)
                        Health checks...
```

**Steps:**
1. Start Green environment with new code
2. Run database migrations (see details below)
3. Perform health checks:
   ```bash
   curl http://green-api:8000/health
   curl http://green-api:8000/ready
   curl http://green-api:8000/metrics
   ```

4. Smoke tests (validate Green):
   ```bash
   # Test login flow
   curl -X POST http://green-api:8000/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"test@example.com","password":"password"}'
   
   # Test match retrieval
   curl http://green-api:8000/v1/leagues
   
   # Test WebSocket connection
   wscat -c ws://green-api:8000/v1/ws
   ```

### Phase 3: Traffic Switch (< 1 minute)

```
At Deployment → Switch traffic from Blue to Green

BLUE                    GREEN
✓ No new traffic       ✓ All traffic
✓ Draining...          ✓ Handling requests
✓ Existing conns       ✓ New connections
  close gracefully

DNS/Router updated:
api.liveview.app → GREEN-IP
```

**Warning:** Connection draining is automatic in most load balancers, but:
- Web: FastAPI closes gracefully (30s timeout)
- WebSocket: Existing connections stay open until client disconnects

### Phase 4: Validation (5-10 minutes)

```
GREEN is now LIVE
✓ Monitor metrics
✓ Monitor logs
✓ Monitor errors (Sentry)
```

**Success Criteria:**
- ✅ No increase in error rate (< 0.1%)
- ✅ No increase in latency (p95 < 200ms)
- ✅ No new Sentry errors
- ✅ All health checks passing

### Phase 5: Cleanup (optional)

```
After 24-48 hours (BLUE still running as backup):
- Confirm GREEN is stable
- Delete BLUE environment
- Free up resources
```

---

## Implementation on Railway

### Prerequisites

1. **Health Check Endpoints (Already Implemented)**
   ```python
   @app.get("/health")
   async def health():
       return {"status": "ok"}
   
   @app.get("/ready")
   async def ready():
       # Check database and Redis connectivity
       return {"status": "ready", "db": "ok", "redis": "ok"}
   ```

2. **Graceful Shutdown (Already Implemented)**
   ```python
   # FastAPI lifespan handles cleanup
   # Database connections closed
   # WebSocket manager stopped
   # Traces flushed
   ```

### Railway Deployment Steps

#### Manual Blue-Green (Current Recommended)

1. **Create Green Instances**
   ```bash
   # In Railway UI:
   # 1. Create new "liveview-green-api" service
   # 2. Clone environment variables from Blue
   # 3. Set image tag to new version
   ```

2. **Deploy Green**
   ```bash
   # In Railway: Deploy service
   # Monitor logs for startup
   docker logs api-green
   ```

3. **Run Smoke Tests**
   ```bash
   # Test connectivity
   curl https://api-green.railway.app/health
   
   # Test API
   curl https://api-green.railway.app/v1/leagues
   ```

4. **Switch DNS**
   ```bash
   # Update custom domain → Green IP
   # Or update API_URL in frontend config
   ```

5. **Monitor & Validate**
   ```bash
   # Watch metrics for 10 minutes
   # - Error rate: Sentry dashboard
   # - Latency: Datadog/CloudWatch
   # - Logs: Railway logs
   ```

6. **Keep Blue as Backup** (24-48 hours)
   ```bash
   # Yellow/paused state
   # Can quickly revert if issues found
   ```

7. **Cleanup**
   ```bash
   # After 24-48h: Delete Blue
   # Rename Green → production
   ```

---

## Database Migrations

### Zero-Downtime Migrations

**Strategy:** Migrations must be compatible with both Blue and Green.

#### ✅ Safe Migrations (can run before traffic switch)

```python
# 1. Adding a nullable column
ALTER TABLE matches ADD COLUMN deleted_at TIMESTAMPTZ NULL;

# 2. Adding an index
CREATE INDEX idx_matches_deleted ON matches(deleted_at);

# 3. Adding a new table
CREATE TABLE audit_log (...);
```

**Timing:**
```
Before deployment:
1. Run migration on shared database
2. Deploy Green (uses new column automatically)
3. Deploy Blue (still works, new column is nullable)
4. Switch traffic to Green
```

#### ⚠️ Risky Migrations (require careful handling)

```python
# 1. Removing a column
# Problem: Old code (Blue) may still reference it
# Solution: Deploy without removal first, then remove in separate deployment

# 2. Renaming a column
# Problem: Old code (Blue) can't find it
# Solution: Use compatibility layer, alias old name to new

# 3. Adding NOT NULL column without default
# Problem: Inserts fail while old code runs
# Solution: Make nullable first, then add NOT NULL constraint in Green-only code
```

**Safe Approach for Risky Migrations:**

```
1. Expand Phase (prep migration)
   - Add new column (nullable)
   - Keep old column
   - Code handles both
   - Deploy Blue-Green

2. Contract Phase (cleanup in new deploy)
   - Remove old column
   - Deploy Green only
   - Switch traffic
```

### Migration Checklist

```bash
# Before deployment
! [ ] Review all migration SQL
! [ ] Test migrations on staging database
! [ ] Estimate migration time (test on production-sized data)
! [ ] Ensure <= 5 minute migration time (impact on Green startup)
! [ ] Document rollback procedure

# Deployment
! [ ] Stop all writes to database (optional, for long migrations)
! [ ] Run migration on shared database
! [ ] Verify migration with: SELECT * FROM schema_migrations
! [ ] Deploy Green environment
! [ ] Run smoke tests on Green
! [ ] Switch traffic to Green

# Post-deployment
! [ ] Monitor error logs for migration-related issues
! [ ] Check data integrity (no missing records)
! [ ] Verify indexes are used (EXPLAIN ANALYZE)
! [ ] Keep Blue as rollback (24-48 hours)
```

---

## Rollback Procedure

### Quick Rollback (< 5 minutes)

**Scenario:** Green has issues, need to revert immediately.

```bash
# 1. Detect issue (Sentry alert, latency spike, error rate)
# 2. Switch traffic back to Blue (update DNS/load balancer)
# 3. Notify team
# 4. Keep Green for debugging
```

**DNS Switch (immediate):**
```bash
# Update API_URL in frontend config
export REACT_APP_API_URL=https://api-blue.railway.app

# Or update: api.liveview.app CNAME → blue-api.railway.app
```

**Database Rollback (if migration caused issues):**
```bash
# Restore from pre-deployment backup
# (time varies, typically 15-30 minutes)
```

### Testing Rollback Procedure

```bash
# Quarterly: Test that rollback works
1. Create a test migration that adds/removes column
2. Deploy Green with migration
3. Switch traffic to Green
4. Simulate error (e.g., kill Green)
5. Verify Blue still works
6. Drop migration from Blue (rollback)
7. Document any issues
```

---

## Kubernetes Setup (Optional, for future)

If moving beyond Railway to self-hosted Kubernetes:

```yaml
# blue-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: liveview-api-blue
spec:
  replicas: 2
  selector:
    matchLabels:
      version: blue
  template:
    metadata:
      labels:
        version: blue
    spec:
      containers:
      - name: api
        image: liveview-api:v1.1.0
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5

---
# green-deployment.yaml (identical, different version)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: liveview-api-green
spec:
  replicas: 0  # Disabled until deployment
  # ... rest same as blue ...
  spec:
    containers:
    - name: api
      image: liveview-api:v1.2.0  # New version

---
# service.yaml (routes traffic)
apiVersion: v1
kind: Service
metadata:
  name: liveview-api
spec:
  selector:
    version: blue  # Points to blue by default
  ports:
  - port: 8000
  # During deployment:
  # 1. Deploy green
  # 2. Scale up green
  # 3. Validate green
  # 4. Update selector to "green"
  # 5. Scale down blue (keep as backup)
```

---

## Monitoring Checklist

Create a checklist to monitor during/after deployment:

```
DEPLOYMENT MONITORING

□ 0-5min: Green Starting
  □ Container pulling image
  □ Database migrations running
  □ Services initializing
  □ Health checks passing: /health
  □ Readiness checks passing: /ready

□ 5-10min: Green Validation
  □ Smoke tests passing
  □ No errors in logs
  □ API endpoints responding (< 200ms)
  □ WebSocket connecting
  □ Database queries working

□ 10-15min: Traffic Switch
  □ Load balancer updated
  □ DNS propagated
  □ Blue receiving 0% traffic
  □ Green receiving 100% traffic

□ 15-25min: Post-Deployment
  □ Error rate < 0.1% (Sentry)
  □ P95 latency < 200ms
  □ No database locks
  □ Memory usage stable
  □ CPU usage normal

□ 24-48h: Cleanup
  □ Green confirmed stable
  □ No regressions reported
  □ Delete Blue environment
```

---

## Best Practices

### 1. Test Deployments Regularly

```bash
# Weekly practice deployment to staging
1. Create feature branch
2. Merge to staging
3. Deploy to staging environment
4. Run full E2E tests
5. Delete staging
# Ensures deployment process is smooth
```

### 2. Feature Flags for Riskier Changes

```python
@app.get("/matches/{match_id}")
async def get_match(match_id: UUID):
    # New feature behind flag (safe to deploy to both envs)
    if feature_enabled("new_match_detail"):
        return enhanced_match_detail(match_id)
    return basic_match_detail(match_id)
```

Then toggle flag after validation in Green.

### 3. Monitor Third-Party APIs

```python
# If ESPN API is down, Green might error out
# Before switch, check:
curl https://site.api.espn.com/apis/site/v2/sports/soccer/

# If down, delay deployment
```

### 4. Coordinate with Backend/Frontend Deploys

```
Scenario: API adds new field, frontend uses it

Option A (tight coupling):
1. Deploy API Green
2. Deploy Frontend Green
3. Switch both simultaneously

Option B (decoupled):
1. Deploy API (backward compatible)
2. Wait 24h
3. Deploy Frontend
4. No coordination needed
```

**Recommendation:** Always make API backward compatible.

---

## Troubleshooting

### Green Won't Start

```bash
# Check logs
docker logs api-green

# Common issues:
1. Database migration failed
   → Check migration syntax
   → Restore backup

2. Environment variables missing
   → Verify OTEL_*, SPOTIFY_*, LV_* vars set

3. Insufficient resources
   → Check Railway CPU/memory limits
   → Scale down other services
```

### Requests Timing Out After Switch

```bash
# Symptom: Requests work on Blue, fail on Green

# Causes:
1. Slow queries
   → Check EXPLAIN ANALYZE in Green
   
2. Database connection pool exhausted
   → Increase SQLAlchemy pool size
   
3. Redis connection issues
   → Check Redis connectivity from Green

4. High latency between regions
   → Ensure Green & database in same region
```

### WebSocket Connections Dropping

```bash
# During traffic switch, WebSocket clients experience:
1. Connection drops (client reconnects)
2. Brief message loss (queued on server)

# Mitigate with client-side:
- Automatic reconnection (already in JS client)
- Offline queue (not yet implemented)
```

---

## Estimated Timeline

| Phase | Duration | Operations |
|-------|----------|------------|
| Pre-deployment | 5 min | Code review, build artifacts |
| Green deployment | 10-15 min | Spin up, migrations, tests |
| Traffic switch | < 1 min | Update DNS/load balancer |
| Validation | 10 min | Monitor metrics |
| Cleanup (next day) | 5 min | Delete Blue |
| **Total** | **30-40 min** | Full zero-downtime update |

## Rollback Timeline

| Scenario | Duration | Complexity |
|----------|----------|------------|
| DNS revert (if detected immediately) | < 5 min | Low |
| Database rollback | 15-30 min | Medium |
| Code revert + redeploy | 30-40 min | Medium |

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [TEST_PLAN.md](TEST_PLAN.md) - Testing strategy
- [RUNBOOK_LIVE_SCORES.md](RUNBOOK_LIVE_SCORES.md) - Operational procedures
- [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) - Pre-production checklist

