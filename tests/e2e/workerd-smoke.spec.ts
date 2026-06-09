/**
 * E2E workerd smoke — Risk #5 (test-plan.md §2):
 * Critical routes render on workerd preview; middleware redirects unauthenticated users.
 *
 * Read-only: no pantry mutations, no storageState (overrides chromium project default).
 * Provenance: seed.spec.ts locator patterns; webServer in playwright.config.ts (build + preview).
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("E2E workerd smoke: Risk #5 preview routes", () => {
  test("[Risk #5] signin page renders the login form", async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page.getByRole("heading", { name: "Logowanie" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();
  });

  test("[Risk #5] unauthenticated dashboard visit redirects to signin", async ({ page }) => {
    await page.goto("/dashboard");

    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { name: "Logowanie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();
  });
});
