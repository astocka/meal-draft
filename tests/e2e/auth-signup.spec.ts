/**
 * E2E auth signup — Risk #4 (test-plan.md §2):
 * Signup form renders with all required fields; client-side validation catches
 * missing/short inputs without a network round-trip; server-side invite-code
 * gate redirects back with a Polish error message without touching Supabase.
 *
 * Read-only: no user creation, no storageState required.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "a".repeat(12);
const WRONG_INVITE = "a".repeat(15); // passes client-side ≥15 check; fails server gate

test.describe("E2E auth: signup page", () => {
  test("[signup] page renders all required form fields", async ({ page }) => {
    await page.goto("/auth/signup");

    await expect(page.getByRole("heading", { name: "Rejestracja" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Hasło", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Potwierdź hasło")).toBeVisible();
    await expect(page.getByLabel("Kod zaproszenia")).toBeVisible();
    await expect(page.getByRole("button", { name: "Utwórz konto" })).toBeVisible();
  });

  test("[signup] shows link back to signin page", async ({ page }) => {
    await page.goto("/auth/signup");

    const link = page.getByRole("link", { name: "Zaloguj się" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/auth/signin");
  });

  test("[signup] unauthenticated access is allowed — no redirect away", async ({ page }) => {
    await page.goto("/auth/signup");

    await expect(page.getByRole("heading", { name: "Rejestracja" })).toBeVisible();
    expect(page.url()).toContain("/auth/signup");
  });

  test("[signup] client: shows error when email is missing", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByRole("button", { name: "Utwórz konto" }).click();

    await expect(page.getByText("Adres e-mail jest wymagany")).toBeVisible();
    expect(page.url()).not.toContain("?error=");
  });

  test("[signup] client: shows error when invite code is too short", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByLabel("E-mail").fill(VALID_EMAIL);
    await page.getByLabel("Hasło", { exact: true }).fill(VALID_PASSWORD);
    await page.getByLabel("Potwierdź hasło").fill(VALID_PASSWORD);
    await page.getByLabel("Kod zaproszenia").fill("tooshort");

    await page.getByRole("button", { name: "Utwórz konto" }).click();

    await expect(page.getByText("Kod zaproszenia jest za krótki")).toBeVisible();
    expect(page.url()).not.toContain("?error=");
  });

  test("[signup] client: shows error when passwords do not match", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByLabel("E-mail").fill(VALID_EMAIL);
    await page.getByLabel("Hasło", { exact: true }).fill(VALID_PASSWORD);
    await page.getByLabel("Potwierdź hasło").fill("different_password_999");
    await page.getByLabel("Kod zaproszenia").fill(WRONG_INVITE);

    await page.getByRole("button", { name: "Utwórz konto" }).click();

    await expect(page.getByText("Hasła nie są identyczne")).toBeVisible();
    expect(page.url()).not.toContain("?error=");
  });

  test("[signup] server: wrong invite code redirects back with Polish error — no Supabase call", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByLabel("E-mail").fill(VALID_EMAIL);
    await page.getByLabel("Hasło", { exact: true }).fill(VALID_PASSWORD);
    await page.getByLabel("Potwierdź hasło").fill(VALID_PASSWORD);
    await page.getByLabel("Kod zaproszenia").fill(WRONG_INVITE);

    await page.getByRole("button", { name: "Utwórz konto" }).click();

    // Server invite-code gate fires before admin Supabase client is created
    await page.waitForURL("**/auth/signup?error=**");
    await expect(page.getByText(/Nieprawidłowy kod zaproszenia/)).toBeVisible();
  });
});
