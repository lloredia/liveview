# Testing Guide for LiveView

This guide covers how to run all test suites in the LiveView application.

## Overview

LiveView includes comprehensive testing across multiple layers:

- **Unit Tests** — Individual function/component tests
- **Integration Tests** — Full stack API tests (client → API → DB → Redis)
- **E2E Tests** — End-to-end user journey tests with Playwright
- **Security Tests** — OWASP Top 10 vulnerability tests
- **Migration Tests** — Database schema validation
- **Load Tests** — Performance and scalability tests
- **Component Tests** — Frontend component rendering and interactions

## Quick Start

### Backend Tests

```bash
# Install dependencies
cd backend
pip install -r requirements.txt
pip install pytest-asyncio pytest-cov

# Set up test databases (needs PostgreSQL running)
createdb liveview_test
createdb liveview_migrations_test
createdb liveview_security_test

# Set up Redis for tests (needs Redis running)
redis-cli -n 0 FLUSHDB
redis-cli -n 1 FLUSHDB
redis-cli -n 2 FLUSHDB
redis-cli -n 3 FLUSHDB

# Run all backend tests
pytest tests/ -v --cov=. --cov-report=html

# Run specific test suites
pytest tests/test_integration_api.py -v
pytest tests/test_security.py -v
pytest tests/test_migrations.py -v
```

### Frontend Tests

```bash
# Install dependencies
cd frontend
npm install

# Run unit/component tests
npm test

# Run E2E tests
npm install -D @playwright/test
npx playwright install

# Start the frontend dev server (in separate terminal)
npm run dev

# Run E2E tests
npx playwright test frontend/e2e/

# Run with UI mode
npx playwright test --ui

# View test report
npx playwright show-report
```

## Detailed Test Documentation

### 1. Backend Unit Tests

Unit tests verify individual functions and components in isolation.

**Location:** `backend/tests/`

**Run Tests:**
```bash
pytest tests/test_scheduler_provider.py -v
pytest tests/test_notification_engine.py -v
pytest tests/test_ws_fanout.py -v
```

**Coverage:**
- Polling intervals and scheduling logic
- Notification event detection (goals, lead changes, etc.)
- WebSocket message fan-out across instances

### 2. Integration Tests

Integration tests verify the full API stack with real databases and caches.

**Location:** `backend/tests/test_integration_api.py`

**What's Tested:**
- GET /v1/leagues — List all leagues
- GET /v1/leagues/{id}/scoreboard — Get matches for a league
- GET /v1/matches/{id} — Match center view
- GET /v1/matches/{id}/timeline — Match events
- GET /v1/today — All matches for a date
- ETag-based caching
- Redis snapshot synchronization
- Rate limiting
- Request ID injection
- CORS headers

**Run Tests:**
```bash
# Start services first
docker-compose up postgres redis

# In separate terminal
cd backend
pytest tests/test_integration_api.py -v -s

# With coverage
pytest tests/test_integration_api.py --cov=api --cov-report=html
```

**Example Output:**
```
test_get_leagues PASSED
test_get_scoreboard PASSED
test_get_match_center PASSED
test_etag_caching PASSED
test_rate_limiting PASSED
```

### 3. Database Migration Tests

Migration tests verify that database schema changes work and can be rolled back.

**Location:** `backend/tests/test_migrations.py`

**What's Tested:**
- Migration 001: Initial schema creation
- Migration 002: Football sport support
- Migration 003: News tables
- Migration 005: Push notification support
- Migration 006: Authentication tables
- Migration 007: Provider columns
- Full migration sequence
- Migration idempotency (can run multiple times safely)
- Schema constraints and indices

**Run Tests:**
```bash
# Clean database (careful in production!)
dropdb liveview_migrations_test
createdb liveview_migrations_test

# Run tests
cd backend
pytest tests/test_migrations.py -v

# Test specific migration
pytest tests/test_migrations.py::test_migration_001_initial -v
```

### 4. Security Tests (OWASP Top 10)

Security tests verify protection against common vulnerabilities.

**Location:** `backend/tests/test_security.py`

**What's Tested:**

#### A. SQL Injection Prevention
```python
# Tests that malicious SQL in parameters is rejected
pytest tests/test_security.py::TestSQLInjection -v
```

#### B. Authentication Bypass
```python
# Missing/invalid/expired/tampered JWT tokens
pytest tests/test_security.py::TestAuthenticationBypass -v
```

#### C. Input Validation (XSS Prevention)
```python
# HTML/script injection in query parameters
pytest tests/test_security.py::TestInputValidation -v
```

#### D. Broken Access Control
```python
# Users can't access other users' data
pytest tests/test_security.py::TestAccessControl -v
```

#### E. Sensitive Data Exposure
```python
# Database errors, server info not leaked
pytest tests/test_security.py::TestSensitiveDataExposure -v
```

#### F. Rate Limiting
```python
pytest tests/test_security.py::TestRateLimiting -v
```

#### G. Password Security
```python
pytest tests/test_security.py::TestPasswordSecurity -v
```

**Run All Security Tests:**
```bash
cd backend
pytest tests/test_security.py -v --tb=short
```

### 5. Frontend Unit/Component Tests

Component tests verify rendering, user interactions, and state management.

**Location:** `frontend/__tests__/components.test.tsx`

**What's Tested:**

#### Form Validation
- Email validation
- Password validation
- Matching passwords
- Required fields

#### Error States
- Network error display
- Retry buttons
- Validation error messages
- Field-specific errors

#### Loading States
- Loading indicators
- Disabled buttons during submission
- Skeleton loaders
- State transitions

#### User Interactions
- Click handlers
- Toggle visibility
- Keyboard events (Enter, Escape)
- Form submission

#### Accessibility
- ARIA labels
- Semantic HTML
- Keyboard navigation

**Run Tests:**
```bash
cd frontend

# Run all tests
npm test

# Run with watch mode (re-run on file change)
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- components.test.tsx

# Run specific test suite
npm test -- --testNamePattern="Form Validation"
```

**Example Output:**
```
PASS  frontend/__tests__/components.test.tsx
  Form Validation
    LoginForm
      ✓ should show validation error for invalid email (25ms)
      ✓ should require email field (15ms)
      ✓ should require password field (12ms)
    RegisterForm
      ✓ should validate matching passwords (40ms)
  Error States
    ✓ should display error message on network failure (35ms)
    ✓ should show retry button on error (20ms)
  Loading States
    ✓ should show loading indicator while data is being fetched (105ms)
    ✓ should disable button during submission (125ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

### 6. End-to-End Tests (Playwright)

E2E tests verify complete user journeys in a real browser.

**Location:** `frontend/e2e/app.spec.ts`

**What's Tested:**

#### Navigation
- Page loads correctly
- Navigation between pages works
- Breadcrumbs functional

#### Match List
- Matches display on home page
- Infinite scroll loads more matches
- League filtering works

#### Match Detail
- Clicking match shows details
- Score displays
- Teams display
- Timeline/events display

#### Authentication
- Login page loads
- Email required
- Invalid email rejected

#### User Interactions
- Add to favorites toggle
- Dark mode toggle

#### Error Handling
- Network errors handled gracefully
- 404 pages for invalid routes
- Offline functionality

#### Performance
- Page loads in < 5 seconds
- Mobile responsive
- Tablet responsive
- Mobile menu on small screens

**Setup (One Time):**
```bash
cd frontend

# Install Playwright and browsers
npm install -D @playwright/test
npx playwright install
```

**Run Tests:**
```bash
# Run all E2E tests
npx playwright test frontend/e2e/

# Run in UI mode (recommended for development)
npx playwright test --ui

# Run with specific browser
npx playwright test --project=chromium

# Run specific test file
npx playwright test frontend/e2e/app.spec.ts

# Run specific test
npx playwright test -g "should display matches on today view"

# Debug mode (step through tests)
npx playwright test --debug

# Show test report
npx playwright show-report
```

**Example Output:**
```
Running 30 tests using 1 worker

  ✓ Navigation / should load home page (2.3s)
  ✓ Navigation / should navigate between pages (1.8s)
  ✓ Match List / should display matches on today view (3.2s)
  ✓ Match List / should load more matches on scroll (4.5s)
  ✓ Match Detail View / should show match details when clicked (2.1s)
  ✓ Authentication / should show login page (1.5s)
  ...

30 passed (45.3s)
```

### 7. Load Tests

Load tests verify performance under realistic traffic patterns.

**Location:** `backend/scripts/load_test_locust.py` and `backend/scripts/load_test_k6.js`

**Run with Locust (Python):**
```bash
cd backend

# Install Locust
pip install locust

# Start backend server first (in separate terminal)
python -m api.service

# Run load tests (10 users, spawn at 2 per second, 1 minute duration)
locust -f scripts/load_test_locust.py \
  --host=http://localhost:8000 \
  --users=10 \
  --spawn-rate=2 \
  --run-time=1m \
  --headless

# Interactive mode (opens web UI)
locust -f scripts/load_test_locust.py --host=http://localhost:8000
# Visit http://localhost:8089 to start tests
```

**Run with k6 (JavaScript, more advanced):**
```bash
# Install k6 (macOS)
brew install k6

# On Linux
sudo apt-get install k6

# Run load test
k6 run backend/scripts/load_test_k6.js --vus 10 --duration 1m

# Run with custom parameters
k6 run backend/scripts/load_test_k6.js --vus 50 --duration 5m --rps 100
```

**What's Tested:**
- Response times under load
- Throughput (requests per second)
- Error rates
- Latency percentiles (p50, p95, p99)
- Resource usage (CPU, memory)

**Example Output:**
```
        /scenario/0 ...... [ 10% done] 1 VU00m10.0s/1m
        /scenario/0 ...... [ 50% done] 5 VUs 00m30.5s/1m
        /scenario/0 ...... [100% done] 10 VUs 00m59.8s/1m

     ✓ status is 200
     ✓ response time < 1000ms

     checks.........................: 100% ✓ 10000 ✗ 0
     data_received..................: 12.5 MB 209 kB/s
     data_sent......................: 5.2 MB 86 kB/s
     http_req_duration..............: avg=145ms  p(95)=412ms p(99)=621ms
     http_reqs......................: 10000 166.39 req/s
```

## CI/CD Integration

Tests run automatically on:
- **Push to main/develop**: All tests except load tests
- **Nightly**: Load tests (scheduled)
- **Pull Requests**: Full test suite

GitHub Actions workflow: [.github/workflows/tests.yml](.github/workflows/tests.yml)

**View CI Results:**
```bash
# GitHub Actions
https://github.com/yourusername/liveview/actions

# Codecov coverage report
https://codecov.io/gh/yourusername/liveview
```

## Test Coverage Goals

| Layer | Current | Target |
|-------|---------|--------|
| Backend | ~60% | 80%+ |
| Frontend | ~15% | 70%+ |
| Integration | ~30% | 80%+ |
| Security | ~40% | 95%+ |

**Check Coverage:**
```bash
# Backend
cd backend
pytest --cov=. --cov-report=html
# Open htmlcov/index.html

# Frontend
cd frontend
npm test -- --coverage
# View coverage/ directory
```

## Troubleshooting

### Tests Fail: "Cannot connect to database"
```bash
# Ensure PostgreSQL is running
psql -U liveview -d liveview_test -c "SELECT 1"

# If needed, create test database
createdb liveview_test
```

### Tests Fail: "Cannot connect to Redis"
```bash
# Ensure Redis is running
redis-cli ping
# Should return "PONG"

# If needed
redis-server
```

### E2E Tests Fail: "Playwright browsers not installed"
```bash
cd frontend
npx playwright install
```

### Load Tests Fail: "Port 8000 already in use"
```bash
# Kill existing process
lsof -ti :8000 | xargs kill -9

# Or use different port
python -m api.service --port 8001
```

## Advanced Testing

### Debug a Failing Test
```bash
# Backend
pytest tests/test_integration_api.py::test_get_leagues -v -s --pdb

# Frontend  
npm test -- --testNamePattern="should show validation error" --verbose
```

### Profile Test Performance
```bash
# Backend
pytest tests/ --durations=10  # Show slowest 10 tests

# Frontend
npm test -- --outputFile=results.json --json
```

### Test in Different Environments
```bash
# Against production API
BASE_URL=https://api.liveview.app npx playwright test

# Against staging
BASE_URL=https://staging.liveview.app npx playwright test

# Against local backend
python -m api.service &
BASE_URL=http://localhost:8000 npx playwright test
```

## Best Practices

✅ **DO:**
- Run full test suite before pushing
- Write tests for bugs before fixing
- Keep tests focused and independent
- Use descriptive test names
- Mock external APIs
- Test both happy path and error cases

❌ **DON'T:**
- Skip tests in CI
- Leave `test.only()` in code
- Mock too much (defeats integration testing)
- Test implementation details, not behavior
- Ignore flaky tests (fix the root cause)

## Further Reading

- [Pytest Documentation](https://docs.pytest.org/)
- [Jest Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [k6 Load Testing](https://k6.io/docs/)
