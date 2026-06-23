#!/usr/bin/env tsx
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reviewDiff } from "./agents/reviewer.ts";
import { loadPackageEnv } from "./load-env.ts";
import { pingModel } from "./provider/openrouter.ts";

const USAGE = `Usage:
  code-review [review]   Review a git diff from stdin (default)
  code-review ping       Verify OpenRouter connectivity`;

async function readDiffFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function requireApiKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY. Set it in src/.env or the environment.");
    process.exit(1);
  }
}

async function runReview(): Promise<void> {
  const diff = await readDiffFromStdin();
  if (!diff.trim()) {
    console.error("No diff on stdin. Pipe git diff, e.g.: git diff main...HEAD | pnpm review");
    process.exit(1);
  }

  const review = await reviewDiff(diff, undefined, undefined, process.env.PR_TITLE?.trim());
  console.log(JSON.stringify(review, null, 2));

  // Local CLI: non-zero exit on fail for pipe-friendly scripts. In GHA the workflow
  // posts the PR comment first, then fails in a dedicated enforce step.
  if (review.verdict === "fail" && !process.env.GITHUB_ACTIONS) {
    process.exit(1);
  }
}

async function runPing(): Promise<void> {
  const { model, reply } = await pingModel();
  console.log(`Model connection OK (${model})`);
  console.log(`Reply: ${reply}`);
}

async function main(): Promise<void> {
  loadPackageEnv();
  requireApiKey();

  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "review") {
    await runReview();
    return;
  }

  if (subcommand === "ping") {
    await runPing();
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}\n\n${USAGE}`);
  process.exit(1);
}

const isCliEntry = resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntry) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
