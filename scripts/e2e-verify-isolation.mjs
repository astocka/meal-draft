/**
 * Fast E2E isolation check (test-plan step 3) for local Windows dev.
 * Build once, auth once, run each mutating spec twice.
 * After pantry cleanup (DELETE in preview logs) the Playwright child is stopped —
 * tests finish but the worker can hang on browser teardown on Windows.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREVIEW_PORT = 4321;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const SPEC_TIMEOUT_MS = 90_000;
const POST_CLEANUP_GRACE_MS = 2_000;

const MUTATING_SPECS = [
  "tests/e2e/seed.spec.ts",
  "tests/e2e/no-match-info-panel.spec.ts",
  "tests/e2e/try-another-stale-response.spec.ts",
];

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready at ${url} after ${timeoutMs}ms`);
}

function runPlaywrightSpec(spec, previewStream, playwrightEnv) {
  return new Promise((resolve, reject) => {
    let sawPantryPost = false;
    let sawPantryDelete = false;
    let failed = false;
    let output = "";

    const onPreviewData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes("POST /api/pantry")) sawPantryPost = true;
      if (sawPantryPost && text.includes("DELETE /api/pantry")) {
        sawPantryDelete = true;
      }
    };

    previewStream.on("data", onPreviewData);

    const child = spawn(
      "pnpm",
      ["exec", "playwright", "test", spec, "--project=chromium", "--workers=1", "--reporter=line"],
      {
        cwd: ROOT,
        shell: true,
        env: { ...process.env, ...playwrightEnv },
      },
    );

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (text.includes("✘") || /\d+ failed/.test(text)) {
        failed = true;
      }
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    const deadline = Date.now() + SPEC_TIMEOUT_MS;
    const poll = setInterval(() => {
      if (failed) {
        clearInterval(poll);
        previewStream.off("data", onPreviewData);
        child.kill();
        reject(new Error(`Playwright reported failure for ${spec}\n${output}`));
        return;
      }
      if (sawPantryDelete) {
        clearInterval(poll);
        setTimeout(() => {
          previewStream.off("data", onPreviewData);
          child.kill();
          resolve(undefined);
        }, POST_CLEANUP_GRACE_MS);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        previewStream.off("data", onPreviewData);
        child.kill();
        reject(
          new Error(`Timeout waiting for pantry cleanup in ${spec} (POST=${sawPantryPost}, DELETE=${sawPantryDelete})`),
        );
      }
    }, 200);

    child.on("error", (err) => {
      clearInterval(poll);
      previewStream.off("data", onPreviewData);
      reject(err);
    });
  });
}

const distEntry = path.join(ROOT, "dist/server/entry.mjs");
if (existsSync(distEntry)) {
  console.log("→ Reusing existing dist/ build");
} else {
  console.log("→ Building once…");
  run("pnpm", ["run", "build"]);
}

console.log("→ Starting preview server…");
const preview = spawn("pnpm", ["run", "preview", "--", "--port", String(PREVIEW_PORT)], {
  cwd: ROOT,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
preview.stderr?.pipe(process.stderr);

try {
  await waitForServer(BASE_URL);

  console.log("→ Authenticating test user A…");
  run("node", ["scripts/e2e-auth.mjs"], { PLAYWRIGHT_BASE_URL: BASE_URL });

  const playwrightEnv = {
    PLAYWRIGHT_BASE_URL: BASE_URL,
    PLAYWRIGHT_REUSE_SERVER: "true",
    PLAYWRIGHT_SKIP_SETUP: "true",
  };

  for (let pass = 1; pass <= 2; pass += 1) {
    console.log(`\n→ Isolation pass ${pass}/2`);
    for (const spec of MUTATING_SPECS) {
      console.log(`  • ${path.basename(spec)}`);
      await runPlaywrightSpec(spec, preview.stdout, playwrightEnv);
      console.log("    ✓ cleanup confirmed");
    }
  }

  console.log("\n✓ Both isolation passes passed (3 mutating specs × 2 runs).");
} finally {
  preview.kill();
}
