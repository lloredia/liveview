# Sentry Error Reporting Setup

## Overview

Sentry provides real-time error tracking and monitoring for both frontend and backend applications. This guide explains how to integrate Sentry into LiveView for production error monitoring.

**What Sentry tracks:**
- Uncaught JavaScript exceptions
- Unhandled promise rejections
- React component errors (Error Boundaries)
- Network errors
- Performance issues (slow page loads, API calls)
- Session replays (optional, useful for debugging)

**Cost:** Free tier includes up to 5,000 error events/month. Starter plan ($29/month) includes unlimited events and 1,000 session replays.

---

## Frontend Setup (Next.js)

### 1. Create Sentry Project

1. Go to [sentry.io](https://sentry.io)
2. Sign up or log in
3. Create new project
4. Select **Next.js** platform
5. Copy your **DSN** (looks like: `https://abc123@o123.ingest.sentry.io/456`)

### 2. Install Dependencies

```bash
cd frontend
npm install @sentry/nextjs
```

### 3. Configure Environment Variables

Copy your DSN to `.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn-here@o123.ingest.sentry.io/456
NEXT_PUBLIC_SENTRY_ENABLED=true
```

The configuration is already in place with these features:

- **Client-side errors**: GlobalErrorHandler and ErrorBoundary report to Sentry
- **Performance monitoring**: Tracks slow page loads (10% sample rate in production)
- **Session replay**: Records user interaction for debugging (5% sample rate in production)

### 4. Test Integration

In development, errors still log to console. In production (`NODE_ENV=production`):

```bash
npm run build
npm run start
```

Then navigate to `/error` or trigger an error in the browser console:

```javascript
throw new Error("Test error for Sentry")
```

Check your Sentry dashboard after a few seconds—the error should appear.

### 5. Customize (Optional)

Edit `frontend/sentry.client.config.ts` to:

- Adjust `tracesSampleRate` (currently 10% in production)
- Modify `ignoreErrors` regex patterns
- Add custom integrations (performance monitoring, etc.)
- Enable/disable session replay

---

## Backend Setup (FastAPI)

### 1. Install Sentry SDK

```bash
cd backend
pip install sentry-sdk[fastapi]
```

### 2. Configure Environment Variables

Add to `.env` or Railway secrets:

```env
SENTRY_DSN=https://your-dsn-here@o123.ingest.sentry.io/456
SENTRY_ENABLED=true
```

> **Note:** Backend uses a different environment variable than frontend (no `NEXT_PUBLIC_`).

### 3. Initialize in FastAPI

Add to `backend/api/app.py` (after importing):

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

sentry_dsn = os.getenv("SENTRY_DSN", "")
sentry_enabled = os.getenv("SENTRY_ENABLED", "true").lower() == "true"

if sentry_dsn and sentry_enabled:
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        traces_sample_rate=0.1 if os.getenv("ENVIRONMENT") == "production" else 1.0,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
        ],
        debug=os.getenv("ENVIRONMENT") != "production",
    )
```

### 4. Test Integration

Trigger an error in a test endpoint:

```bash
curl http://localhost:8000/v1/test-error
```

Check your Sentry dashboard—the error should appear with full stack trace.

---

## Key Features

### Error Grouping

Sentry automatically groups similar errors by:
- Exception type
- Stack trace
- Error message

This prevents alert fatigue and groups related issues together.

### Issue Timeline

For each error, Sentry shows:
- Stack trace with code context
- Environment (browser type, OS, network)
- User information (if identified)
- Breadcrumbs (recent user actions)
- Session replay (if enabled)

### Alerts

Configure alerts to notify your team:

1. In Sentry dashboard: **Alerts** → **Create Alert Rule**
2. Set triggers:
   - New issue first seen
   - Issue frequency spike
   - Regression (error reappears after resolved)
3. Set notification target (email, Slack, PagerDuty)

### Performance Monitoring

Sentry tracks:
- Page load time
- API response time
- Database query performance
- Frontend render performance

Access via **Performance** tab in Sentry dashboard.

---

## Best Practices

### 1. Identify Users in Production

Add user context to errors for better debugging:

```javascript
// In frontend error handler
Sentry.setUser({
  id: "123",
  username: "user@example.com",
  email: "user@example.com",
});
```

### 2. Release Tracking

Tag errors with your app version for tracking issues by release:

```python
# Backend
sentry_sdk.init(
    ...,
    release="1.0.0",
)
```

```javascript
// Frontend (in sentry.client.config.ts)
Sentry.init({
  ...,
  release: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
});
```

### 3. Breadcrumbs

Add custom breadcrumbs to track user actions before errors:

```javascript
Sentry.captureMessage("User viewed match details", "info", {
  breadcrumbs: [{ message: "match_id: 123" }]
});
```

### 4. Source Maps

Ensure source maps are uploaded for production builds:

```bash
# Backend: typically not needed (Python)

# Frontend: Vercel auto-uploads
npm run build  # .next/ folder has source maps
# Deploy to Vercel
git push
```

### 5. Privacy

Redact sensitive data before sending to Sentry:

```javascript
// In sentry.client.config.ts
beforeSend(event) {
  // Remove API keys, auth tokens, etc.
  if (event.request) {
    event.request.headers = {};
  }
  return event;
}
```

---

## Monitoring Your Errors

### Daily Routine

1. Check Sentry dashboard each morning
2. Review new issues and regressions
3. Assign to team members
4. Track resolution in GitHub issues

### Metrics to Track

- **Error rate**: Errors per 1000 requests
- **Affected users**: How many users hit errors
- **Crash-free rate**: What % of sessions had no errors
- **Most frequent errors**: Which issues affect most users

### SLA Recommendations

- **Critical errors** (payment, auth): 1-hour response
- **High priority** (features broken): 4-hour response
- **Medium** (UX issues): 1-day response
- **Low** (edge cases): backlog

---

## Troubleshooting

### Errors Not Appearing in Sentry

1. **Check DSN is set**: `echo $NEXT_PUBLIC_SENTRY_DSN`
2. **Check enabled**: `NEXT_PUBLIC_SENTRY_ENABLED` should be `true`
3. **Check environment**: Only reports in production by default. Dev/test logs to console.
4. **Check network**: Errors send to `o*.ingest.sentry.io`—verify firewall allows HTTPS outbound

### Too Many Errors

1. Adjust `ignoreErrors` to filter out noise
2. Reduce `tracesSampleRate` (currently 10% in prod)
3. Set error budget: alerts only above threshold

### High Costs

1. Use free tier limits (5K events/month)
2. Increase `tracesSampleRate` threshold
3. Disable session replay for non-critical scenarios
4. Use error sampling based on severity

---

## References

- [Sentry Docs](https://docs.sentry.io/)
- [Sentry Next.js Integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry FastAPI Integration](https://docs.sentry.io/platforms/python/guides/fastapi/)
- [Release Health](https://docs.sentry.io/platforms/javascript/releases/)
- [Session Replay](https://docs.sentry.io/platforms/javascript/session-replay/)

---

## Related Documentation

- [Distributed Tracing](distributed-tracing.md) - Add OpenTelemetry for cross-service tracing
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and components
- [TEST_PLAN.md](TEST_PLAN.md) - Testing strategy

