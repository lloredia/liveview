# Quick Reference: Test Commands

## Backend Tests (Python)

```bash
# All tests
cd backend && pytest tests/ -v

# With coverage
pytest tests/ -v --cov=. --cov-report=html

# Specific test types
pytest tests/test_integration_api.py -v     # Integration tests
pytest tests/test_security.py -v             # Security tests
pytest tests/test_migrations.py -v           # Migration tests

# Watch mode (requires pytest-watch)
ptw tests/

# Stop on first failure
pytest tests/ -x

# Show print output
pytest tests/ -s

# Markers
pytest tests/ -m integration -v              # Only integration tests
pytest tests/ -m security -v                 # Only security tests
pytest tests/ -m "not slow" -v              # Skip slow tests
```

## Frontend Tests (JavaScript)

```bash
# All component tests
cd frontend && npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# E2E with UI mode (interactive)
npm run test:e2e:ui

# E2E debug mode
npm run test:e2e:debug

# Specific test file
npm test -- components.test.tsx

# Tests matching pattern
npm test -- --testNamePattern="Form"
```

## Combined Test Runs

```bash
# Backend + coverage
cd backend && pytest tests/ --cov=. --cov-report=html

# Frontend + coverage
cd frontend && npm run test:coverage

# All frontend tests (unit + e2e)
cd frontend && npm test && npm run test:e2e

# Everything (very slow)
cd backend && pytest tests/ --cov=.
cd ../frontend && npm test && npm run test:e2e
```

## Test Databases

```bash
# PostgreSQL setup (run once)
createdb liveview_test

# Clear everything
psql -d liveview_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Redis setup (usually auto-running)
redis-cli FLUSHDB  # Clear DB 0
redis-cli FLUSHALL # Clear all DBs
```

## GitHub Actions (CI/CD)

Tests run automatically on:
- Push to any branch
- Pull requests
- Click "Run workflow" button

View results: Repository → Actions tab → Select workflow

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "PostgreSQL connection refused" | Start PostgreSQL: `brew services start postgresql` (macOS) |
| "Redis connection refused" | Start Redis: `redis-server` (terminal) or `brew services start redis` (macOS) |
| "Module not found" | `cd backend && pip install -r requirements.txt` |
| "npm not found" | `cd frontend && npm install` |
| "Port 3000 already in use" | Use different port: `npm run dev -- -p 3001` |
| "Playwright browsers not found" | `cd frontend && npx playwright install` |

## Environment Variables

**Backend** (`.env.test` or `.env`)
```
DATABASE_URL=postgresql+asyncpg://liveview:liveview@localhost/liveview_test
REDIS_URL=redis://localhost:6379/0
ENVIRONMENT=dev
```

**Frontend** (Defaults to localhost)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Test Statistics

| Layer | Type | Count | Time |
|-------|------|-------|------|
| Backend | Unit | 13 | <10s |
| Backend | Integration | 13 | <30s |
| Backend | Security | 40+ | <20s |
| Backend | Migration | 9 | <10s |
| Frontend | Component | 20+ | <5s |
| Frontend | E2E | 30+ | <2m |
| **Total** | **All** | **100+** | **~3m** |

## Coverage Goals

- Backend: 70%+ (focus on critical paths)
- Frontend: 50%+ (increased from 15%)
- E2E: 20+ happy paths (user journeys)

## Documentation

- [RUN_TESTS_LOCALLY.md](./RUN_TESTS_LOCALLY.md) - Detailed setup & troubleshooting
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Comprehensive testing guide
- [TESTING_IMPLEMENTATION_SUMMARY.md](./TESTING_IMPLEMENTATION_SUMMARY.md) - Implementation details
