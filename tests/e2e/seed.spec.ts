/**
 * E2E seed exemplar — Risk #3 (test-plan.md §2):
 * Try another in-flight: card stays mounted during loading; only the latest response wins.
 *
 * Requires TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD (.env.test), auth setup
 * (playwright.config.ts storageState), and a running app (webServer in config).
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { openDashboard } from "./helpers";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

const FIRST_RECIPE = {
  name: "Omlet z pomidorami",
  prep_time_minutes: 15,
  ingredients: ["jajka", "pomidor"],
  steps: ["Usmaż omlet."],
};

const SECOND_RECIPE = {
  name: "Sałatka z pomidorami",
  prep_time_minutes: 10,
  ingredients: ["pomidor", "ogórek"],
  steps: ["Pokrój warzywa."],
};

async function mockGenerateWithDelay(page: Page, firstDelayMs: number, secondDelayMs: number): Promise<() => number> {
  let callCount = 0;

  const handler = async (route: Route) => {
    callCount += 1;
    const recipe = callCount === 1 ? FIRST_RECIPE : SECOND_RECIPE;
    const delayMs = callCount === 1 ? firstDelayMs : secondDelayMs;
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recipe,
        history_id: `e2e-hist-${callCount}-${Date.now()}`,
      }),
    });
  };

  await page.route("**/api/generate", handler);
  return () => callCount;
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

test.describe("E2E seed: Risk #3 Try another in-flight UI", () => {
  test("[Risk #3] Try another keeps recipe card mounted and applies only the latest response", async ({ page }) => {
    const uniqueIngredient = `Pomidor-e2e-${Date.now()}`;
    const getGenerateCallCount = await mockGenerateWithDelay(page, 200, 800);

    try {
      await openDashboard(page);
      await expect(page.getByRole("heading", { name: "Spiżarnia" })).toBeVisible();

      await addPantryIngredient(page, uniqueIngredient);

      await page.getByRole("button", { name: "Generuj" }).click();
      await expect(page.getByText(FIRST_RECIPE.name)).toBeVisible();

      const tryAnother = page.getByRole("button", { name: "Inny przepis" });
      const secondGenerate = page.waitForResponse(
        (response) => response.url().includes("/api/generate") && response.request().method() === "POST",
      );
      await tryAnother.click();

      // Loading renames the button — assert the in-flight state, not the idle label.
      const loadingTryAnother = page.getByRole("button", { name: "Szukam innego…" });
      await expect(loadingTryAnother).toBeVisible();
      await expect(loadingTryAnother).toBeDisabled();
      await expect(page.getByText(FIRST_RECIPE.name)).toBeVisible();

      // Rapid second click cannot start another in-flight request while loading.
      await loadingTryAnother.click({ trial: true }).catch(() => undefined);

      await secondGenerate;
      await expect(page.getByText(SECOND_RECIPE.name)).toBeVisible();
      await expect(page.getByText(FIRST_RECIPE.name)).toBeHidden();
      await expect(tryAnother).toBeEnabled();
      await expect(tryAnother).toHaveText("Inny przepis");
      expect(getGenerateCallCount()).toBe(2);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (page.url().includes("/dashboard")) {
        await removePantryIngredient(page, uniqueIngredient).catch(() => undefined);
      }
    }
  });
});
