import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = path.join(process.cwd(), "playwright/.auth/user.json");

function requireEnv(name: "TEST_USER_A_EMAIL" | "TEST_USER_A_PASSWORD"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} for E2E — copy .env.test.example to .env.test and configure.`);
  }
  return value;
}

setup("authenticate as test user A", async ({ page }) => {
  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto("/auth/signin");
  await page.getByLabel("E-mail").fill(requireEnv("TEST_USER_A_EMAIL"));
  await page.locator("#password").fill(requireEnv("TEST_USER_A_PASSWORD"));
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Spiżarnia" })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
