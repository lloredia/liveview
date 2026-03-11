# How to Run Tests Locally

This guide provides step-by-step instructions for running all test suites locally on your machine.

## Prerequisites

- Python 3.11+ installed
- Node.js 18+ installed
- PostgreSQL 15+ running
- Redis 7+ running

## Environment Variables

Create `.env.test` files as needed:

### Backend Test Environment

```bash
# backend/.env.test
DATABASE_URL=postgresql+asyncpg://liveview:liveview@localhost/liveview_test
REDIS_URL=redis://localhost:6379/1
ENVIRONMENT=dev
LOG_LEVEL=debug
```

### Frontend Test Environment

```bash
# frontend/.env.test
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running Backend Tests

### Setup Python Environment

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Or with pip-tools
pip install -r requirements.txt --require-hashes
```

### Run All Backend Tests

```bash
# Run all tests with verbose output
pytest tests/ -v

# Run with coverage report
pytest tests/ -v --cov=. --cov-report=html

# Run specific test file
pytest tests/test_integration_api.py -v

# Run specific test
pytest tests/test_integration_api.py::test_get_leagues -v

# Run tests matching a pattern
pytest tests/ -k integration -v

# Run tests with specific markers
pytest tests/ -m integration -v
pytest tests/ -m security -v
pytest tests/ -m migration -v
```

### Test Categories

**Unit Tests** (Fast, in-memory)
```bash
pytest tests/test_api.py -v
pytest tests/ -m "not integration and not security and not migration" -v
```

**Integration Tests** (Requires database)
```bash
pytest tests/test_integration_api.py -v
pytest tests/ -m integration -v
```

**Migration Tests** (Requires database)
```bash
pytest tests/test_migrations.py -v
pytest tests/ -m migration -v
```

**Security Tests** (Comprehensive security scanning)
```bash
pytest tests/test_security.py -v
pytest tests/ -m security -v
```

### Coverage Report

```bash
# Generate HTML coverage report
pytest tests/ --cov=. --cov-report=html
open htmlcov/index.html  # On macOS
xdg-open htmlcov/index.html  # On Linux

# Generate coverage in console
pytest tests/ --cov=. --cov-report=term-missing
```

### Debugging Tests

```bash
# Stop on first failure
pytest tests/ -x

# Drop into debugger on failure
pytest tests/ --pdb

# Show print statements
pytest tests/ -s

# Run with detailed output
pytest tests/ -vv

# Collect tests without running them
pytest tests/ --collect-only
```

## Running Frontend Tests

### Setup JavaScript Environment

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Install Playwright browsers (for E2E tests)
npx playwright install
```

### Jest Unit Tests

```bash
# Run all component tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- components.test.tsx

# Run tests matching a pattern
npm test -- --testNamePattern="Form Validation"

# Get coverage summary
npm test -- --coverage --coverageReporters=text-summary
```

### Playwright E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test frontend/e2e/app.spec.ts

# Run tests in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run with headed browsers (show browser window)
npx playwright test --headed

# Run specific test
npx playwright test -t "Navigation"
```

### Coverage Reports

```bash
# Generate Jest coverage report
npm run test:coverage
open coverage/lcov-report/index.html  # On macOS
xdg-open coverage/lcov-report/index.html  # On Linux

# View Playwright test report
npx playwright show-report
```

## Running All Tests Together

### Quick Test Suite

```bash
# Backend quick tests (fast, unit + integration)
cd backend && pytest tests/test_api.py tests/test_integration_api.py -v --tb=short

# Frontend quick tests
cd frontend && npm test -- --testPathPattern="components|auth|utils"
```

### Full Test Suite

```bash
# Run everything with coverage (slow, ~5-10 minutes)
cd backend && pytest tests/ --cov=. --cov-report=html
cd ../frontend && npm test -- --coverage && npm run test:e2e
```

### Parallel Execution

```bash
# Backend tests in parallel (requires pytest-xdist)
pip install pytest-xdist
pytest tests/ -n auto

# Frontend tests in parallel
npm test -- --maxWorkers=auto
```

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
psql -U postgres -d postgres -c "SELECT 1"

# Create test database if it doesn't exist
createdb -U postgres liveview_test

# Reset test database
dropdb -U postgres liveview_test
createdb -U postgres liveview_test
```

### Redis Connection Issues

```bash
# Check if Redis is running
redis-cli ping
# Should output: PONG

# Clear Redis cache if tests are failing
redis-cli FLUSHALL
```

### Module Import Errors

```bash
# Ensure you're in the right directory
cd backend  # for backend tests
cd frontend  # for frontend tests

# Clear Python cache
find . -type d -name __pycache__ -exec rm -r {} +
find . -type d -name .pytest_cache -exec rm -r {} +

# Clear Node cache
cd frontend && rm -rf node_modules .next && npm install
```

### Port Already in Use

```bash
# If dev server port (3000) is in use
npm run dev -- -p 3001

# If API port (8000) is in use
uvicorn api.app:app --port 8001
```

## Continuous Integration (GitHub Actions)

The tests run automatically on:
- Push to any branch
- Pull requests
- Scheduled daily at 2 AM UTC

View results: Go to the repo → Actions tab → Select workflow run → View logs

## Performance Tips

1. **Use markers to run subset of tests:**
   ```bash
   pytest tests/ -m "not slow" -v
   ```

2. **Run only changed tests:**
   ```bash
   pytest tests/ --lf  # Last failed
   pytest tests/ -k "test_recent"
   ```

3. **Cache dependencies:**
   ```bash
   cd backend && pip install --cache-dir ~/.pip-cache -r requirements.txt
   cd frontend && npm ci  # Uses package-lock.json for faster install
   ```

4. **Use test markers strategically:**
   ```python
   @pytest.mark.slow
   def test_load_performance():
       pass
   ```
   Then skip with: `pytest -m "not slow"`

## Common Test Commands

### Backend

```bash
# Everything
pytest tests/

# Only fast tests
pytest tests/ -m "not slow"

# With coverage
pytest tests/ --cov=. --cov-report=term-missing

# Stop on first failure
pytest tests/ -x

# Debug failing test
pytest tests/test_security.py::TestSQLInjection::test_sql_injection_prevention -vv --tb=short
```

### Frontend

```bash
# Everything
npm test && npm run test:e2e

# Only components
npm test -- components.test.tsx

# Only E2E
npm run test:e2e

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Next Steps

After all tests pass locally:

1. Commit your changes: `git add . && git commit -m "Test changes"`
2. Push to GitHub: `git push origin branch-name`
3. Review workflow results: Check GitHub Actions for CI/CD run
4. Create pull request if working on a feature branch

## Documentation References

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Comprehensive testing documentation
- [TESTING_IMPLEMENTATION_SUMMARY.md](./TESTING_IMPLEMENTATION_SUMMARY.md) - What was implemented
- [FULL_APP_REVIEW.md](./FULL_APP_REVIEW.md) - Complete app review and issues
