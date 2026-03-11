#!/bin/bash
# Quick setup script for testing dependencies

echo "📦 Setting up LiveView testing environment..."

# Backend
echo ""
echo "🐍 Backend: Installing Python test dependencies..."
cd backend
pip install pytest-asyncio pytest-cov pytest-asyncio-fixture -q
echo "✅ Backend dependencies installed"

# Frontend
echo ""
echo "📱 Frontend: Installing Node test dependencies..."
cd ../frontend
npm install -D \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jest \
  jest-environment-jsdom \
  @jest/types \
  ts-jest \
  @types/jest \
  @playwright/test \
  -q

echo "✅ Frontend dependencies installed"

# Install Playwright browsers
echo ""
echo "🌐 Installing Playwright browsers..."
npx playwright install -q
echo "✅ Playwright browsers installed"

echo ""
echo "✅ Testing environment ready!"
echo ""
echo "Next steps:"
echo "  Backend tests:    cd backend && pytest tests/ -v"
echo "  Frontend tests:   cd frontend && npm test"
echo "  E2E tests:        cd frontend && npx playwright test"
echo "  All tests:        .github/workflows/tests.yml (see GitHub Actions)"
echo ""
echo "📚 See TESTING_GUIDE.md for detailed instructions"
