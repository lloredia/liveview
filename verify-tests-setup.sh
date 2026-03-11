#!/bin/bash

# verify-tests-setup.sh
# Verifies that all test dependencies are properly installed and configured

set -e

echo "🧪 LiveView Test Setup Verification"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
PASSED=0
FAILED=0
WARNINGS=0

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

echo "System Requirements:"
echo "-------------------"

# Check Python
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python 3 installed: $PYTHON_VERSION"
    
    # Check Python version is 3.11+
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
    if [ "$PYTHON_MINOR" -lt 11 ]; then
        print_warning "Python version should be 3.11+ for best compatibility (currently $PYTHON_VERSION)"
    fi
else
    print_error "Python 3 not found. Install from https://www.python.org/"
fi

# Check Node
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not found. Install from https://nodejs.org/"
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm not found. Install Node.js from https://nodejs.org/"
fi

# Check PostgreSQL client
if command_exists psql; then
    PSQL_VERSION=$(psql --version | awk '{print $3}')
    print_success "PostgreSQL client installed: $PSQL_VERSION"
else
    print_warning "PostgreSQL client not found. Install postgresql for database management."
fi

# Check Redis client
if command_exists redis-cli; then
    REDIS_VERSION=$(redis-cli --version)
    print_success "Redis CLI installed: $REDIS_VERSION"
else
    print_warning "Redis CLI not found. Install redis for testing Redis connections."
fi

echo ""
echo "Backend Dependencies:"
echo "-------------------"

cd backend

# Check if requirements.txt exists
if [ -f "requirements.txt" ]; then
    print_success "requirements.txt found"
else
    print_error "requirements.txt not found in backend/"
fi

# Check if pytest is installed
if python3 -m pip show pytest >/dev/null 2>&1; then
    PYTEST_VERSION=$(python3 -m pip show pytest | grep Version | awk '{print $2}')
    print_success "pytest installed: $PYTEST_VERSION"
else
    print_warning "pytest not installed. Run: pip install -r requirements.txt"
fi

# Check if pytest-asyncio is installed
if python3 -m pip show pytest-asyncio >/dev/null 2>&1; then
    print_success "pytest-asyncio installed"
else
    print_warning "pytest-asyncio not installed. Run: pip install -r requirements.txt"
fi

# Check if pytest-cov is installed
if python3 -m pip show pytest-cov >/dev/null 2>&1; then
    print_success "pytest-cov installed"
else
    print_warning "pytest-cov not installed. Run: pip install pytest-cov"
fi

# Check conftest.py
if [ -f "tests/conftest.py" ]; then
    print_success "tests/conftest.py found"
else
    print_error "tests/conftest.py not found"
fi

# Check test files
TEST_FILES=("test_integration_api.py" "test_security.py" "test_migrations.py")
for test_file in "${TEST_FILES[@]}"; do
    if [ -f "tests/$test_file" ]; then
        print_success "tests/$test_file found"
    else
        print_warning "tests/$test_file not found"
    fi
done

cd ..

echo ""
echo "Frontend Dependencies:"
echo "--------------------"

cd frontend

# Check if node_modules exists
if [ -d "node_modules" ]; then
    print_success "node_modules directory exists"
else
    print_warning "node_modules not found. Run: npm install"
fi

# Check if jest is installed
if npm list jest >/dev/null 2>&1; then
    JEST_VERSION=$(npm list jest | grep jest | head -1 | awk '{print $2}')
    print_success "jest installed: $JEST_VERSION"
else
    print_warning "jest not installed. Run: npm install"
fi

# Check if playwright is installed
if npm list @playwright/test >/dev/null 2>&1; then
    PLAYWRIGHT_VERSION=$(npm list @playwright/test | grep @playwright/test | head -1 | awk '{print $3}')
    print_success "@playwright/test installed: $PLAYWRIGHT_VERSION"
else
    print_warning "@playwright/test not installed. Run: npm install"
fi

# Check jest.config.cjs
if [ -f "jest.config.cjs" ]; then
    print_success "jest.config.cjs found"
else
    print_error "jest.config.cjs not found"
fi

# Check jest.setup.js
if [ -f "jest.setup.js" ]; then
    print_success "jest.setup.js found"
else
    print_warning "jest.setup.js not found"
fi

# Check playwright.config.ts
if [ -f "playwright.config.ts" ]; then
    print_success "playwright.config.ts found"
else
    print_warning "playwright.config.ts not found"
fi

# Check test files
if [ -f "__tests__/components.test.tsx" ]; then
    print_success "__tests__/components.test.tsx found"
else
    print_error "__tests__/components.test.tsx not found"
fi

if [ -f "e2e/app.spec.ts" ]; then
    print_success "e2e/app.spec.ts found"
else
    print_error "e2e/app.spec.ts not found"
fi

cd ..

echo ""
echo "CI/CD Configuration:"
echo "-------------------"

# Check GitHub workflows
if [ -f ".github/workflows/tests.yml" ]; then
    print_success ".github/workflows/tests.yml found"
else
    print_warning ".github/workflows/tests.yml not found"
fi

echo ""
echo "Test Documentation:"
echo "------------------"

DOCS=("TESTING_GUIDE.md" "TESTING_IMPLEMENTATION_SUMMARY.md" "RUN_TESTS_LOCALLY.md" "TEST_QUICK_REFERENCE.md")
for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        print_success "$doc found"
    else
        print_warning "$doc not found"
    fi
done

echo ""
echo "Database Check:"
echo "---------------"

# Check PostgreSQL connection
if command_exists psql; then
    if psql -U liveview -d postgres -c "SELECT 1" >/dev/null 2>&1; then
        print_success "PostgreSQL running and accessible"
    else
        print_warning "PostgreSQL not accessible. Check connection details."
        print_warning "Expected: psql -U liveview -d postgres"
    fi
else
    print_warning "PostgreSQL client not installed. Cannot verify connection."
fi

# Check Redis connection
if command_exists redis-cli; then
    if redis-cli ping >/dev/null 2>&1; then
        print_success "Redis running and accessible"
    else
        print_warning "Redis not accessible. Check Redis is running."
    fi
else
    print_warning "Redis CLI not installed. Cannot verify connection."
fi

echo ""
echo "Summary:"
echo "-------"
echo -e "✓ Passed: ${GREEN}$PASSED${NC}"
echo -e "✗ Failed: ${RED}$FAILED${NC}"
echo -e "⚠ Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: cd backend && pip install -r requirements.txt"
    echo "2. Run: cd frontend && npm install"
    echo "3. Run: cd frontend && npx playwright install"
    echo "4. Run backend tests: cd backend && pytest tests/ -v"
    echo "5. Run frontend tests: cd frontend && npm test"
    echo "6. Run E2E tests: cd frontend && npm run test:e2e"
    exit 0
else
    echo -e "${RED}✗ Some critical checks failed. Please fix the issues above.${NC}"
    exit 1
fi
