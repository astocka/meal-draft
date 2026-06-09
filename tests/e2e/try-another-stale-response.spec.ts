/**
 * E2E — Risk #3 out-of-order generate responses (test-plan.md §2):
 * A late slow response must not overwrite a newer fast response on the recipe card.
 *
 * UI button lock prevents double-click overlap; page.evaluate dispatches two Try Another
 * clicks synchronously so two in-flight requests start before loadingSource re-renders.
 * Wrapped in test.fail() until MealGenerator gains a generation request-id guard
 * (see saveGenerationRef pattern for favorites).
 *
 * Requires TEST_USER_A_* (.env.test), auth setup, running workerd preview.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { openDashboard } from "./helpers";

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

const SETUP_RECIPE = {
  name: "Omlet startowy e2e",
  prep_time_minutes: 15,
  ingredients: ["jajka"],
  steps: ["Usmaż omlet."],
};

const RECIPE_A = {
  name: "Sałatka wolna A",
  prep_time_minutes: 12,
  ingredients: ["sałata"],
  steps: ["Wymieszaj."],
};

const RECIPE_B = {
  name: "Zupa szybka B",
  prep_time_minutes: 10,
  ingredients: ["marchew"],
  steps: ["Gotuj."],
};

function mockGenerateReversedOrder(page: Page): () => number {
  let callCount = 0;

  const handler = async (route: Route) => {
    callCount += 1;
    let recipe;
    let delayMs;

    if (callCount === 1) {
      recipe = SETUP_RECIPE;
      delayMs = 50;
    } else if (callCount === 2) {
      recipe = RECIPE_A;
      delayMs = 800;
    } else {
      recipe = RECIPE_B;
      delayMs = 100;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recipe,
        history_id: `e2e-stale-${callCount}-${Date.now()}`,
      }),
    });
  };

  void page.route("**/api/generate", handler);
  return () => callCount;
}

async function clearGenerateMock(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
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

test.describe("E2E Risk #3 out-of-order generate responses", () => {
  test("[Risk #3] out-of-order generate responses keep latest result", async ({ page }) => {
    test.fail(true, "MealGenerator lacks generation request-id guard — remove when stale responses are discarded");

    const uniqueIngredient = `Marchew-e2e-${Date.now()}`;
    const getGenerateCallCount = mockGenerateReversedOrder(page);

    try {
      await openDashboard(page);
      await expect(page.getByRole("heading", { name: "Spiżarnia" })).toBeVisible();

      await addPantryIngredient(page, uniqueIngredient);

      // Establish recipe card via Generuj (mock call 1 — fast setup recipe).
      await page.getByRole("button", { name: "Generuj" }).click();
      await expect(page.getByText(SETUP_RECIPE.name)).toBeVisible();

      const generateResponse = (response: { url(): string; request(): { method(): string } }) =>
        response.url().includes("/api/generate") && response.request().method() === "POST";

      const tryAnother = page.getByRole("button", { name: "Inny przepis" });

      // Synchronous in-page double-click starts two requestGeneration calls before loadingSource re-render.
      const responseWaits = Promise.all([
        page.waitForResponse(generateResponse),
        page.waitForResponse(generateResponse),
      ]);

      await tryAnother.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });

      await responseWaits;

      // Fast response B must remain visible; slow response A must not overwrite it.
      await expect(page.getByText(RECIPE_B.name)).toBeVisible();
      await expect(page.getByText(RECIPE_A.name)).toBeHidden();

      expect(getGenerateCallCount()).toBeGreaterThanOrEqual(3);
    } finally {
      await clearGenerateMock(page).catch(() => undefined);
      if (page.url().includes("/dashboard")) {
        await removePantryIngredient(page, uniqueIngredient).catch(() => undefined);
      }
    }
  });
});
