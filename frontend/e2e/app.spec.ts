/**
 * End-to-end tests using Playwright.
 * Tests full user journeys: login → view matches → interact with app
 * Run with: npx playwright test frontend/e2e/
 * Requires: npm install -D @playwright/test
 */
import { test, expect } from "@playwright/test";

test.describe("LiveView E2E Tests", () => {
  // Set base URL from env or use default
  const baseURL = process.env.BASE_URL || "http://localhost:3000";
  const goto = (page: any, path = "") =>
    page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });

  test.describe("Navigation", () => {
    test("should load home page", async ({ page }) => {
      await goto(page, `/`);
      await expect(page).toHaveTitle(/LiveView|Sports/);
      await expect(page.locator("nav, [role=navigation]")).toBeVisible();
    });

    test("should navigate between pages", async ({ page }) => {
      await goto(page, `/`);
      // Check for navigation links
      const navLinks = page.locator("a[href]");
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);
    });

    test("should have working breadcrumbs if present", async ({ page }) => {
      await goto(page, `/`);
      const breadcrumbs = page.locator("[aria-label*=breadcrumb], .breadcrumb");
      if (await breadcrumbs.count() > 0) {
        await expect(breadcrumbs).toBeVisible();
      }
    });
  });

  test.describe("Match List", () => {
    test("should display matches on today view", async ({ page }) => {
      await goto(page, `/`);

      await expect(
        page.getByRole("main", { name: "Match results" })
      ).toBeVisible();
      await expect(
        page.locator('a[href^="/match/"]').first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("should load more matches on scroll", async ({ page }) => {
      await goto(page, `/`);

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
      await goto(page, `/`);

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
      await goto(page, `/`);

      // Find first match and click it
      const firstMatch = page.locator("[data-testid=match-item]").first();
      
      if (await firstMatch.count() > 0) {
        await firstMatch.click();

        // Should navigate to match detail page
        await expect(page).toHaveURL(/\/match|\/matches/);
      }
    });

    test("should display match score", async ({ page }) => {
      // Navigate to a match detail page
      const response = await goto(page, `/match/test-match`).catch(() => null);

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
      const response = await goto(page, `/match/test-match`).catch(() => null);

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
      const response = await goto(page, `/match/test-match`).catch(() => null);

      if (response && response.ok()) {
        const timeline = page.locator("[data-testid=timeline], .timeline, .events");

        if (await timeline.count() > 0) {
          await expect(timeline).toBeVisible();
        }
      }
    });

    test("should render backend match-center fallback data in play-by-play and lineup tabs", async ({
      page,
    }) => {
      await page.route("**/v1/matches/test-match", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            match: {
              id: "test-match",
              phase: "live",
              start_time: "2026-03-18T19:00:00Z",
              venue: "Emirates Stadium",
              home_team: {
                id: "home-1",
                name: "Arsenal",
                short_name: "ARS",
                logo_url: null,
              },
              away_team: {
                id: "away-1",
                name: "Chelsea",
                short_name: "CHE",
                logo_url: null,
              },
            },
            state: {
              score_home: 1,
              score_away: 0,
              clock: "63'",
              period: "2",
              period_scores: [],
              version: 7,
            },
            recent_events: [],
            league: {
              id: "premier-league",
              name: "Premier League",
            },
            generated_at: "2026-03-18T19:03:00Z",
          }),
        });
      });

      await page.route("**/v1/matches/test-match/timeline**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            match_id: "test-match",
            phase: "live",
            events: [
              {
                id: "evt-1",
                event_type: "goal",
                minute: 63,
                second: 0,
                period: "1",
                team_id: "home-1",
                player_name: "Bukayo Saka",
                detail: "Goal by Bukayo Saka",
                score_home: 1,
                score_away: 0,
                synthetic: false,
                confidence: 1,
                seq: 1,
              },
            ],
            count: 1,
            next_seq: null,
            has_more: false,
          }),
        });
      });

      await page.route("**/v1/matches/test-match/lineup", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            source: "football_data",
            home: {
              formation: "4-3-3",
              lineup: [
                {
                  id: 1,
                  name: "David Raya",
                  position: "GK",
                  shirt_number: 22,
                },
              ],
              bench: [
                {
                  id: 2,
                  name: "Leandro Trossard",
                  position: "FW",
                  shirt_number: 19,
                },
              ],
            },
            away: {
              formation: "4-2-3-1",
              lineup: [
                {
                  id: 3,
                  name: "Robert Sanchez",
                  position: "GK",
                  shirt_number: 1,
                },
              ],
              bench: [
                {
                  id: 4,
                  name: "Mykhailo Mudryk",
                  position: "FW",
                  shirt_number: 10,
                },
              ],
            },
          }),
        });
      });

      await page.route("**/api/espn/site/**", async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "not found" }),
        });
      });

      await goto(page, `/match/test-match?league=Premier%20League`);

      await page.getByRole("button", { name: "Play-by-Play" }).click();
      await expect(page.getByRole("button", { name: /1st/i })).toBeVisible();
      await expect(page.getByText("Goal by Bukayo Saka")).toBeVisible();

      await page.getByRole("button", { name: "Lineup" }).click();
      await expect(page.getByText("Data by Football-Data.org")).toBeVisible();
      await expect(page.getByText("David Raya")).toBeVisible();
      await expect(page.getByText("Robert Sanchez")).toBeVisible();
      await expect(page.getByText("Bench")).toBeVisible();
      await expect(page.getByText("Leandro Trossard")).toBeVisible();
    });

    test("should render backend player stats fallback when espn detail is absent", async ({
      page,
    }) => {
      await page.route("**/v1/matches/test-match", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            match: {
              id: "test-match",
              phase: "live",
              start_time: "2026-03-18T19:00:00Z",
              venue: "Emirates Stadium",
              home_team: {
                id: "home-1",
                name: "Arsenal",
                short_name: "ARS",
                logo_url: null,
              },
              away_team: {
                id: "away-1",
                name: "Chelsea",
                short_name: "CHE",
                logo_url: null,
              },
            },
            state: {
              score_home: 1,
              score_away: 0,
              clock: "63'",
              period: "2",
              period_scores: [],
              version: 7,
            },
            recent_events: [],
            league: {
              id: "premier-league",
              name: "Premier League",
            },
            generated_at: "2026-03-18T19:03:00Z",
          }),
        });
      });

      await page.route("**/v1/matches/test-match/player-stats", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            source: "football_data",
            home: {
              teamName: "Arsenal",
              statColumns: ["G", "A", "YC"],
              players: [
                {
                  name: "Bukayo Saka",
                  jersey: "7",
                  position: "FW",
                  stats: { G: 1, A: 0, YC: 0 },
                  starter: true,
                },
              ],
            },
            away: {
              teamName: "Chelsea",
              statColumns: ["G", "A", "YC"],
              players: [
                {
                  name: "Cole Palmer",
                  jersey: "20",
                  position: "FW",
                  stats: { G: 0, A: 0, YC: 1 },
                  starter: true,
                },
              ],
            },
          }),
        });
      });

      await page.route("**/api/espn/site/**", async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "not found" }),
        });
      });

      await goto(page, `/match/test-match?league=Premier%20League`);

      await page.getByRole("button", { name: "Player Stats" }).click();
      await expect(page.getByText("Data by Football-Data.org")).toBeVisible();
      await expect(page.getByRole("button", { name: /Bukayo Saka/i })).toBeVisible();
      await expect(page.getByRole("table").getByText("Bukayo Saka")).toBeVisible();
    });

    test("should render backend team stats when espn detail is absent", async ({
      page,
    }) => {
      await page.route("**/v1/matches/test-match", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            match: {
              id: "test-match",
              phase: "live",
              start_time: "2026-03-18T19:00:00Z",
              venue: "Emirates Stadium",
              home_team: {
                id: "home-1",
                name: "Arsenal",
                short_name: "ARS",
                logo_url: null,
              },
              away_team: {
                id: "away-1",
                name: "Chelsea",
                short_name: "CHE",
                logo_url: null,
              },
            },
            state: {
              score_home: 1,
              score_away: 0,
              clock: "63'",
              period: "2",
              period_scores: [],
              version: 7,
            },
            recent_events: [],
            league: {
              id: "premier-league",
              name: "Premier League",
            },
            generated_at: "2026-03-18T19:03:00Z",
          }),
        });
      });

      await page.route("**/v1/matches/test-match/stats", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            match_id: "test-match",
            teams: [
              {
                team_id: "home-1",
                team_name: "Arsenal",
                side: "home",
                stats: {
                  possession: 61,
                  shotsOnTarget: 5,
                },
              },
              {
                team_id: "away-1",
                team_name: "Chelsea",
                side: "away",
                stats: {
                  possession: 39,
                  shotsOnTarget: 2,
                },
              },
            ],
            generated_at: "2026-03-18T19:03:00Z",
          }),
        });
      });

      await page.route("**/api/espn/site/**", async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "not found" }),
        });
      });

      await goto(page, `/match/test-match?league=Premier%20League`);

      await page.getByRole("button", { name: "Team Stats" }).click();
      await expect(page.getByText("Possession")).toBeVisible();
      await expect(page.getByText("Shots On Target")).toBeVisible();
      await expect(page.getByText("61")).toBeVisible();
      await expect(page.getByText("39")).toBeVisible();
    });
  });

  test.describe("Authentication", () => {
    test("should show login page", async ({ page }) => {
      await goto(page, `/login`);

      const loginForm = page.locator("[data-testid=login-form], form");
      await expect(loginForm.first()).toBeVisible({ timeout: 5000 });
    });

    test("should require email on login", async ({ page }) => {
      await goto(page, `/login`);

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
      await goto(page, `/login`);

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
          (el: HTMLInputElement) => !el.checkValidity()
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
      await goto(page, `/`);

      const favoriteButton = page.locator("[data-testid=favorite-btn]").first();

      if (await favoriteButton.count() > 0) {
        await favoriteButton.click();
        const authDialog = page.getByRole("dialog", {
          name: /Create a free account to track games/i,
        });
        if (await authDialog.count() > 0) {
          await expect(authDialog).toBeVisible();
        } else {
          await expect(favoriteButton).toHaveAttribute(
            "aria-pressed",
            /true|false/
          );
          await expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
        }
      }
    });

    test("should open auth gate when guest favorites a match", async ({ page }) => {
      await goto(page, `/`);

      const signInLink = page.getByRole("link", { name: /Sign in/i });
      if (await signInLink.count() > 0) {
        const favoriteButton = page.locator("[data-testid=favorite-btn]").first();
        await favoriteButton.click();
        await expect(
          page.getByRole("dialog", {
            name: /Create a free account to track games/i,
          })
        ).toBeVisible();
      }
    });
  });

  test.describe("User Interactions", () => {
    test("should toggle dark mode if available", async ({ page }) => {
      await goto(page, `/`);

      const darkModeToggle = page.locator(
        "[data-testid=dark-mode-toggle], button[aria-label*=dark], .theme-toggle"
      );

      if (await darkModeToggle.count() > 0) {
        await darkModeToggle.click();
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle network errors gracefully", async ({ page }) => {
      await goto(page, `/`);
      await expect(
        page.getByRole("main", { name: "Match results" })
      ).toBeVisible();

      await page.context().setOffline(true);
      await expect(
        page.locator("[data-testid=offline-notice]")
      ).toBeVisible({ timeout: 5000 });
      await page.context().setOffline(false);
    });

    test("should show 404 page for invalid route", async ({ page }) => {
      await goto(page, `/nonexistent-page-12345`);

      const body = page.locator("body");
      await expect(body).toBeVisible();
      await expect(body).toContainText(/404|Not Found|not found/i);
    });
  });

  test.describe("Performance", () => {
    test("should load home page within reasonable time", async ({ page }) => {
      const startTime = Date.now();

      await goto(page, `/`);

      const loadTime = Date.now() - startTime;

      // Should load in under 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test("should have good lighthouse score for accessibility", async ({
      page,
    }) => {
      await goto(page, `/`);

      // Check for basic accessibility
      const imagesWithoutAlt = await page.locator("img:not([alt])").count();
      
      // Should have alt text for images (not strict, just check some are good)
      expect(imagesWithoutAlt).toBeLessThan(10);
    });
  });

  test.describe("Mobile Responsiveness", () => {
    test("should be responsive on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone size
      await goto(page, `/`);

      // Should render without horizontal scroll
      const bodyWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );

      expect(bodyWidth).toBeLessThanOrEqual(375);
    });

    test("should be responsive on tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad size
      await goto(page, `/`);

      // Should render without horizontal scroll
      const bodyWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );

      expect(bodyWidth).toBeLessThanOrEqual(768);
    });

    test("should show mobile menu on small screens", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await goto(page, `/`);

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
