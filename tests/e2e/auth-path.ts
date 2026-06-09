import path from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(E2E_DIR, "../..");

/** Repo-root Playwright storageState — must match playwright.config.ts and scripts/e2e-auth.mjs. */
export const AUTH_FILE = path.join(REPO_ROOT, "playwright/.auth/user.json");
