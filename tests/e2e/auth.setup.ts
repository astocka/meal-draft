import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { AUTH_FILE } from "./auth-path";
const PREVIEW_PORT = 4321;
const PREVIEW_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PREVIEW_PORT}`;

function requireEnv(name: "TEST_USER_A_EMAIL" | "TEST_USER_A_PASSWORD"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} for E2E — copy .env.test.example to .env.test and configure.`);
  }
  return value;
}

setup("authenticate as test user A", async ({ request }) => {
  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const email = requireEnv("TEST_USER_A_EMAIL");
  const password = requireEnv("TEST_USER_A_PASSWORD");

  // Request-only auth: no browser launch, so worker teardown stays fast on Windows.
  // Astro origin-check middleware requires Origin on form POSTs.
  const signIn = await request.post("/api/auth/signin", {
    form: { email, password },
    headers: {
      Origin: PREVIEW_ORIGIN,
      Referer: `${PREVIEW_ORIGIN}/auth/signin`,
    },
    maxRedirects: 0,
  });

  if (signIn.status() !== 302 && signIn.status() !== 303) {
    const body = await signIn.text();
    throw new Error(`Sign-in failed: HTTP ${signIn.status()} — ${body.slice(0, 300)}`);
  }

  const location = signIn.headers().location;
  if (!location.includes("/dashboard")) {
    throw new Error(`Sign-in redirect unexpected: ${location || "missing Location header"}`);
  }

  await request.storageState({ path: AUTH_FILE });
});
