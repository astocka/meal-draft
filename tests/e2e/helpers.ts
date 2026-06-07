import { expect, type Page } from "@playwright/test";

/** Requires storageState from auth.setup.ts (see playwright.config.ts). */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeHidden();
}
