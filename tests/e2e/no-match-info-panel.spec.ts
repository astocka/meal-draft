/**
 * E2E — client wire / rendered UI (AGENTS.md meal generation):
 * HTTP 200 `{ recipe: null, reason: "no_match" }` must show the purple info panel
 * (role="status"), not the red error alert (role="alert").
 *
 * Risk #3 is covered by seed.spec.ts.
 * Requires auth setup (playwright.config.ts storageState).
 * Provenance: seed.spec.ts patterns; mocks only the non-deterministic generate API.
 */
import { test, expect, type Page } from "@playwright/test";
import { openDashboard } from "./helpers";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const NO_MATCH_TITLE = "Nie udało się stworzyć przepisu";

async function mockGenerateNoMatch(page: Page): Promise<void> {
  await page.route("**/api/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ recipe: null, reason: "no_match" }),
    });
  });
}

async function addPantryIngredient(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder("Dodaj składnik…").fill(name);
  await page.getByRole("button", { name: "Dodaj składnik" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

async function removePantryIngredient(page: Page, name: string): Promise<void> {
  const row = page.getByRole("listitem").filter({ hasText: name });
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(row).toBeHidden();
}

test.use({ viewport: DESKTOP_VIEWPORT });

test.describe("no_match client UI", () => {
  test("HTTP 200 no_match shows info panel and leaves Generuj enabled", async ({ page }) => {
    const uniqueIngredient = `Pomidor-e2e-${Date.now()}`;
    await mockGenerateNoMatch(page);

    try {
      await openDashboard(page);
      await expect(page.getByRole("heading", { name: "Generator posiłków" })).toBeVisible();

      await addPantryIngredient(page, uniqueIngredient);

      await page.getByRole("button", { name: "Generuj" }).click();

      const infoPanel = page.getByRole("status").filter({ hasText: NO_MATCH_TITLE });
      await expect(infoPanel).toBeVisible();
      await expect(page.getByRole("alert")).toBeHidden();
      await expect(page.getByRole("button", { name: "Generuj" })).toBeEnabled();
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (page.url().includes("/dashboard")) {
        await removePantryIngredient(page, uniqueIngredient).catch(() => undefined);
      }
    }
  });
});
