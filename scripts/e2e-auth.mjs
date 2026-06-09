/**
 * Standalone E2E auth — writes playwright/.auth/user.json without launching a browser worker.
 * Used by test:e2e:isolation to avoid slow Playwright project transitions on Windows.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { readFileSync, existsSync } from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREVIEW_PORT = 4321;
const AUTH_FILE = path.join(ROOT, "playwright/.auth/user.json");

function loadEnv(relativePath, override = false) {
  const envPath = path.join(ROOT, relativePath);
  if (!existsSync(envPath)) return;
  const parsed = parse(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (value.trim() === "") continue;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnv(".env");
loadEnv(".dev.vars");
loadEnv(".env.test", true);

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PREVIEW_PORT}`;
const email = process.env.TEST_USER_A_EMAIL?.trim();
const password = process.env.TEST_USER_A_PASSWORD?.trim();

if (!email || !password) {
  console.error("Missing TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in .env.test");
  process.exit(1);
}

const body = new URLSearchParams({ email, password });
const response = await fetch(`${baseURL}/api/auth/signin`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: baseURL,
    Referer: `${baseURL}/auth/signin`,
  },
  body,
  redirect: "manual",
});

if (response.status !== 302 && response.status !== 303) {
  const text = await response.text();
  console.error(`Sign-in failed: HTTP ${response.status} — ${text.slice(0, 300)}`);
  process.exit(1);
}

const location = response.headers.get("location") ?? "";
if (!location.includes("/dashboard")) {
  console.error(`Sign-in redirect unexpected: ${location || "missing Location"}`);
  process.exit(1);
}

/** @type {import('@playwright/test').Cookie[]} */
const cookies = [];
const raw = response.headers.getSetCookie?.() ?? [];
for (const line of raw) {
  const [pair, ...attrs] = line.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  if (eq === -1) continue;
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  /** @type {Record<string, string>} */
  const map = {};
  for (const attr of attrs) {
    const i = attr.indexOf("=");
    if (i === -1) map[attr.toLowerCase()] = "";
    else map[attr.slice(0, i).toLowerCase()] = attr.slice(i + 1);
  }
  cookies.push({
    name,
    value,
    domain: map.domain ?? new URL(baseURL).hostname,
    path: map.path ?? "/",
    expires: map.expires ? Math.floor(new Date(map.expires).getTime() / 1000) : -1,
    httpOnly: "httponly" in map,
    secure: "secure" in map,
    sameSite: map.samesite === "Strict" ? "Strict" : map.samesite === "None" ? "None" : "Lax",
  });
}

mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
writeFileSync(AUTH_FILE, JSON.stringify({ cookies, origins: [] }, null, 2));
console.log(`Auth saved to ${AUTH_FILE}`);
