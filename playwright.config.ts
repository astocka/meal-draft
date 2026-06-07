import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_PORT = 4321;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PREVIEW_PORT}`;
const AUTH_FILE = path.join(__dirname, "playwright/.auth/user.json");

function loadEnvFile(relativePath: string): void {
  const envPath = path.resolve(__dirname, relativePath);
  if (!existsSync(envPath)) {
    return;
  }
  const parsed = parse(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (value.trim() !== "" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Server secrets (.env / .dev.vars) + test user credentials (.env.test).
loadEnvFile(".env");
loadEnvFile(".dev.vars");
loadEnvFile(".env.test");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
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
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: `pnpm run build && pnpm run preview -- --port ${PREVIEW_PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
