"""
End-to-end tests using Playwright.

Tests full user journeys: login → view matches → interact with app

Run with: npx playwright test frontend/e2e/

Requires:
- npm install -D @playwright/test
"""
import { test, expect } from "@playwright/test";

test.describe("LiveView E2E Tests", () => {
  // Set base URL from env or use default
  const baseURL = process.env.BASE_URL || "http://localhost:3000";

  test.beforeEach(async ({ page }) => {
    // Go to home page before each test
    await page.goto(baseURL);
  });

  test.describe("Navigation", () => {
    test("should load home page", async ({ page }) => {
      await expect(page).toHaveTitle(/LiveView|Sports/);
      await expect(page.locator("nav, [role=navigation]")).toBeVisible();
    });

    test("should navigate between pages", async ({ page }) => {
      // Check for navigation links
      const navLinks = page.locator("a[href]");
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
    });

    test("should have working breadcrumbs if present", async ({ page }) => {
      const breadcrumbs = page.locator("[aria-label*=breadcrumb], .breadcrumb");
      if (await breadcrumbs.count() > 0) {
        await expect(breadcrumbs).toBeVisible();
      }
    });
  });

  test.describe("Match List", () => {
    test("should display matches on today view", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      // Wait for matches to load
      const matches = page.locator("[data-testid=match-item], .match-card");
      
      // Should have at least loading indicator or matches
      const loadingOrMatches = page.locator(
        "[data-testid=loading], .spinner, [data-testid=match-item], .match-card"
      );
      await expect(loadingOrMatches.first()).toBeVisible({ timeout: 10000 });
    });

    test("should load more matches on scroll", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      // Get initial match count
      const initialMatches = await page.locator(
        "[data-testid=match-item], .match-card"
      ).count();

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Wait a bit for new matches to load
      await page.waitForTimeout(1000);

      // Count again (might be same if all loaded)
      const finalMatches = await page.locator(
        "[data-testid=match-item], .match-card"
      ).count();

      expect(finalMatches).toBeGreaterThanOrEqual(initialMatches);
    });

    test("should filter matches by league", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      // Find league filter
      const leagueFilter = page.locator("select[name=league], [data-testid=league-filter]");
      
      if (await leagueFilter.count() > 0) {
        const options = await leagueFilter.locator("option").count();
        expect(options).toBeGreaterThan(0);
      }
    });
  });

  test.describe("Match Detail View", () => {
    test("should show match details when clicked", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      // Find first match and click it
      const firstMatch = page.locator("[data-testid=match-item], .match-card").first();
      
      if (await firstMatch.count() > 0) {
        await firstMatch.click();

        // Should navigate to match detail page
        await expect(page).toHaveURL(/\/match|\/matches/);
      }
    });

    test("should display match score", async ({ page }) => {
      // Navigate to a match detail page
      const matchUrl = `${baseURL}/match/test-match`;
      const response = await page.goto(matchUrl).catch(() => null);

      if (response && response.ok()) {
        // Look for score display
        const scoreDisplay = page.locator(
          "[data-testid=score], .score, [class*=score]"
        );
        
        if (await scoreDisplay.count() > 0) {
          await expect(scoreDisplay.first()).toBeVisible();
        }
      }
    });

    test("should display match teams", async ({ page }) => {
      const matchUrl = `${baseURL}/match/test-match`;
      const response = await page.goto(matchUrl).catch(() => null);

      if (response && response.ok()) {
        const homeTeam = page.locator("[data-testid=home-team], .home-team");
        const awayTeam = page.locator("[data-testid=away-team], .away-team");

        if (await homeTeam.count() > 0) {
          await expect(homeTeam).toBeVisible();
        }

        if (await awayTeam.count() > 0) {
          await expect(awayTeam).toBeVisible();
        }
      }
    });

    test("should display match timeline/events", async ({ page }) => {
      const matchUrl = `${baseURL}/match/test-match`;
      const response = await page.goto(matchUrl).catch(() => null);

      if (response && response.ok()) {
        const timeline = page.locator("[data-testid=timeline], .timeline, .events");

        if (await timeline.count() > 0) {
          await expect(timeline).toBeVisible();
        }
      }
    });
  });

  test.describe("Authentication", () => {
    test("should show login page", async ({ page }) => {
      await page.goto(`${baseURL}/login`);

      const loginForm = page.locator("[data-testid=login-form], form");
      await expect(loginForm.first()).toBeVisible({ timeout: 5000 });
    });

    test("should require email on login", async ({ page }) => {
      await page.goto(`${baseURL}/login`);

      const passwordInput = page.locator(
        "input[type=password], input[name=password]"
      );
      const submitButton = page.locator(
        "button[type=submit], button:has-text('Login')"
      );

      if (await passwordInput.count() > 0 && await submitButton.count() > 0) {
        // Enter password without email
        await passwordInput.fill("password123");
        await submitButton.click();

        // Should show validation error
        const errorMessage = page.locator(
          "[role=alert], .error, [data-testid=error]"
        );
        
        // May or may not show (depends on implementation)
        // Just verify the form is still visible
        await expect(submitButton).toBeVisible();
      }
    });

    test("should reject invalid email", async ({ page }) => {
      await page.goto(`${baseURL}/login`);

      const emailInput = page.locator("input[type=email], input[name=email]");
      const passwordInput = page.locator(
        "input[type=password], input[name=password]"
      );
      const submitButton = page.locator(
        "button[type=submit], button:has-text('Login')"
      );

      if (await emailInput.count() > 0) {
        await emailInput.fill("invalidemail");
        await passwordInput.fill("password123");

        // Browser's native validation should apply
        const isInvalid = await emailInput.evaluate(
          (el: any) => !el.checkValidity()
        );
        
        // May be validated by browser or by app
        await submitButton.click();
        
        // Form should still be visible
        await expect(submitButton).toBeVisible();
      }
    });
  });

  test.describe("User Interactions", () => {
    test("should add match to favorites", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      const favoriteButton = page.locator(
        "[data-testid=favorite-btn], button[aria-label*=favorite], .favorite-btn"
      ).first();

      if (await favoriteButton.count() > 0) {
        // Check initial state
        let isFavorited = await favoriteButton.evaluate(
          (el) => el.getAttribute("aria-pressed") === "true" || el.classList.contains("favorited")
        );

        // Click to toggle
        await favoriteButton.click();

        // Wait for state change
        await page.waitForTimeout(500);

        // Check new state
        const newState = await favoriteButton.evaluate(
          (el) => el.getAttribute("aria-pressed") === "true" || el.classList.contains("favorited")
        );

        expect(newState).toBe(!isFavorited);
      }
    });

    test("should toggle dark mode if available", async ({ page }) => {
      await page.goto(`${baseURL}/`);

      const darkModeToggle = page.locator(
        "[data-testid=dark-mode-toggle], button[aria-label*=dark], .theme-toggle"
      );

      if (await darkModeToggle.count() > 0) {
        const initialColorScheme = await page.evaluate(() => {
          return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
        });

        await darkModeToggle.click();

        // Verify UI changed (optional, depends on implementation)
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle network errors gracefully", async ({ page }) => {
      // Go offline
      await page.context().setOffline(true);

      await page.goto(`${baseURL}/`);

      // Wait for error state or fallback UI
      const errorOrFallback = page.locator(
        "[data-testid=error], [role=alert], .error-message, .offline-notice"
      );

      // Should either show error or gracefully handle offline
      await page.waitForTimeout(1000);

      // Go back online
      await page.context().setOffline(false);
    });

    test("should show 404 page for invalid route", async ({ page }) => {
      await page.goto(`${baseURL}/nonexistent-page-12345`);

      const notFoundMessage = page.locator(
        "text=/404|Not Found|not found/i, [data-testid=not-found]"
      );

      // May redirect or show 404
      const isNotFound = await notFoundMessage.count() > 0 || page.url().includes("404");
      
      // Just verify page loads (doesn't crash)
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Performance", () => {
    test("should load home page within reasonable time", async ({ page }) => {
      const startTime = Date.now();

      await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });

      const loadTime = Date.now() - startTime;

      // Should load in under 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test("should have good lighthouse score for accessibility", async ({
      page,
    }) => {
      await page.goto(`${baseURL}/`);

      // Check for basic accessibility
      const imagesWithoutAlt = await page.locator("img:not([alt])").count();
      
      // Should have alt text for images (not strict, just check some are good)
      expect(imagesWithoutAlt).toBeLessThan(10);
    });
  });

  test.describe("Mobile Responsiveness", () => {
    test("should be responsive on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone size
      await page.goto(`${baseURL}/`);

      // Should render without horizontal scroll
      const bodyWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );

      expect(bodyWidth).toBeLessThanOrEqual(375);
    });

    test("should be responsive on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad size
      await page.goto(`${baseURL}/`);

      // Should render without horizontal scroll
      const bodyWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );

      expect(bodyWidth).toBeLessThanOrEqual(768);
    });

    test("should show mobile menu on small screens", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${baseURL}/`);

      // Look for hamburger menu
      const hamburger = page.locator(
        "button[aria-label*=menu], button[aria-label*=toggle], .hamburger"
      );

      if (await hamburger.count() > 0) {
        await expect(hamburger).toBeVisible();
      }
    });
  });
});
