import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE } from "./tests/e2e/auth-path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_PORT = 4321;
const PREVIEW_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PREVIEW_PORT}`;

function loadEnvFile(relativePath: string, options?: { override?: boolean }): void {
  const envPath = path.resolve(__dirname, relativePath);
  if (!existsSync(envPath)) {
    return;
  }
  const parsed = parse(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (value.trim() === "") {
      continue;
    }
    if (options?.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// .env.test wins on overlap so E2E webServer uses test Supabase even when .env is production.
loadEnvFile(".env");
loadEnvFile(".dev.vars");
loadEnvFile(".env.test", { override: true });

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: PREVIEW_ORIGIN,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      dependencies: process.env.PLAYWRIGHT_SKIP_SETUP === "true" ? undefined : ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command:
      process.env.PLAYWRIGHT_REUSE_SERVER === "true"
        ? `pnpm run preview -- --port ${PREVIEW_PORT}`
        : `pnpm run build && pnpm run preview -- --port ${PREVIEW_PORT}`,
    url: PREVIEW_ORIGIN,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 180_000,
  },
});
