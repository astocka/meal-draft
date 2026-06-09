/**
 * Workerd preview (`astro preview`) reads runtime secrets from `.dev.vars`, not process.env.
 * CI injects Supabase via env vars only — materialize `.dev.vars` when missing.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS_PATH = path.join(ROOT, ".dev.vars");

/** @param {NodeJS.ProcessEnv} [env] */
export function ensureDevVarsForWorkerdPreview(env = process.env) {
  if (existsSync(DEV_VARS_PATH)) {
    return;
  }

  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_KEY?.trim();
  if (!url || !key) {
    return;
  }

  writeFileSync(DEV_VARS_PATH, `SUPABASE_URL=${url}\nSUPABASE_KEY=${key}\n`, "utf8");
}
