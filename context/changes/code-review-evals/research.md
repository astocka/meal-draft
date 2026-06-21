---
date: 2026-06-21T13:50:00+02:00
researcher: AI Agent
git_commit: f0b92396ea5697861addfe1ec8da205b5b9b1634
branch: feat/code-reviewer
repository: mealdraft
topic: "promptfoo eval readiness of packages/code-reviewer"
tags: [research, code-reviewer, promptfoo, evals, ai-sdk, openrouter]
status: complete
last_updated: 2026-06-21
last_updated_by: AI Agent
---

# Research: promptfoo eval readiness of `packages/code-reviewer`

**Date**: 2026-06-21T13:50:00+02:00
**Git Commit**: `f0b92396ea5697861addfe1ec8da205b5b9b1634`
**Branch**: `feat/code-reviewer`
**Repository**: mealdraft

## Research Question

Analyze the current state of `packages/code-reviewer` in the context of introducing promptfoo for AI agent evaluations — reusability of prompts, importability of the agent, and tech-stack alignment. If promptfoo fits, go in that direction; otherwise evaluate other OSS eval toolkits.

---

## Summary

`packages/code-reviewer` is exceptionally well-positioned for promptfoo evals. The public barrel export exposes every layer the evaluator needs: raw prompts, schema, and the fully wired `reviewDiff()` function. promptfoo's **custom TypeScript provider** API maps cleanly onto `reviewDiff()`, and its **built-in `openrouter:<model>` provider** lets you target prompt-only evals without the SDK wrapper. No alternative tool is needed. The recommended approach is a `packages/code-reviewer/evals/` folder with a `promptfooconfig.yaml`, a thin TS provider, and diff fixtures — self-contained, no changes to the main app's Vitest setup required.

---

## Detailed Findings

### 1. Package Public API — What's Importable

`src/index.ts` exports four namespaces, all directly usable in a promptfoo provider:

| Export                               | File                    | Eval Use                                                       |
| ------------------------------------ | ----------------------- | -------------------------------------------------------------- |
| `REVIEW_SCHEMA`                      | `schemas/review.ts:5`   | Validate structured output shape in assertions                 |
| `Review` (type)                      | `schemas/review.ts:41`  | Type-check the provider's return value                         |
| `SYSTEM_PROMPT`                      | `prompts/review.ts:1`   | Use as promptfoo `system` prompt directly                      |
| `buildInstructions(projectRules?)`   | `prompts/review.ts:53`  | Build the full system prompt with optional AGENTS.md injection |
| `buildReviewPrompt(diff)`            | `prompts/review.ts:61`  | Wrap a diff fixture into the `<diff_content>` envelope         |
| `createReviewerAgent(projectRules?)` | `agents/reviewer.ts:8`  | Create the agent in isolation for white-box testing            |
| `reviewDiff(diff, projectRules?)`    | `agents/reviewer.ts:20` | **Single entry point for black-box evals**                     |
| `loadProjectRules()`                 | `project-rules.ts:20`   | Load real AGENTS.md for production-parity evals                |

Key signatures:

```typescript
// agents/reviewer.ts:20
export async function reviewDiff(diff: string, projectRules?: string): Promise<Review>;

// prompts/review.ts:61
export function buildReviewPrompt(diff: string): string;
// → wraps diff in <diff_content> tags (prompt injection guard)

// prompts/review.ts:53
export function buildInstructions(projectRules?: string): string;
// → concatenates SYSTEM_PROMPT + optional project-rules block
```

**Eval-readiness verdict**: `reviewDiff()` is a pure async function with no CLI side effects (those live in `cli.ts:main()`). Importing the package in a promptfoo provider file does not trigger env loading, API key checks, or process exits. The only runtime requirement is `OPENROUTER_API_KEY` in the environment when the provider is actually invoked.

### 2. Package Architecture — Layers Available to Evals

```
packages/code-reviewer/src/
├── index.ts              ← barrel export (all 4 layers)
├── prompts/review.ts     ← SYSTEM_PROMPT, buildInstructions(), buildReviewPrompt()
├── schemas/review.ts     ← REVIEW_SCHEMA (zod), Review type
├── agents/reviewer.ts    ← createReviewerAgent(), reviewDiff()
├── provider/openrouter.ts← createOpenRouterProvider(), resolveReviewModel()
├── project-rules.ts      ← loadProjectRules(), resolveAgentsMdPath()
├── load-env.ts           ← loadPackageEnv() — CLI only, not imported by index.ts
└── cli.ts                ← CLI entry, not importable as a module
```

The `<diff_content>` envelope in `buildReviewPrompt()` (`prompts/review.ts:62`) is a prompt-injection guard. Eval fixtures must be raw diff strings — the provider handles the wrapping.

### 3. promptfoo Tech Stack Alignment

| Requirement                | Status                    | Detail                                                                         |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| ESM package support        | ✅                        | promptfoo supports `file://./provider.mjs` and `.ts` with tsx loader           |
| Custom TS provider         | ✅                        | `ApiProvider` interface: `id()` + `callApi(prompt, context?)`                  |
| Transitive TS imports      | ✅ (**≥ 0.122 required**) | Bug fixed in promptfoo PR #8445, merged 2026-04-09                             |
| OpenRouter built-in        | ✅                        | `openrouter:<model>` provider; PR #8804 fixed apiBaseUrl override (2026-04-19) |
| JSON field assertions      | ✅                        | `type: javascript` + `JSON.parse(output).verdict === 'fail'`                   |
| Multi-line fixture inputs  | ✅                        | `vars` values can be multi-line strings; `file://./fixtures/diff.txt` loading  |
| CI exit code               | ✅                        | `promptfoo eval` exits non-zero on assertion failures                          |
| NodeNext module resolution | ✅                        | promptfoo runs in Node.js; no Cloudflare/workerd concerns                      |

**Version constraint**: promptfoo **≥ 0.122** is required for transitive TypeScript imports to work correctly when a `file://./provider.ts` imports from `../src/agents/reviewer.ts`.

### 4. Two Complementary Eval Modes

#### Mode A — Black-box / Production-parity (Custom TS Provider)

The provider imports `reviewDiff()` and calls it directly. This tests the **exact same code path** that the CLI uses — same model, same prompt assembly, same `ToolLoopAgent` structured output.

```typescript
// evals/providers/eval-provider.ts
import type { ApiProvider, ProviderResponse } from "promptfoo";
import { reviewDiff } from "../src/index.ts";

export default class ReviewerProvider implements ApiProvider {
  id() {
    return "code-reviewer/reviewDiff";
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    // prompt = diff string (already assembled by promptfoo from vars)
    const review = await reviewDiff(prompt);
    return { output: JSON.stringify(review) };
  }
}
```

Config wire-up:

```yaml
providers:
  - id: file://./providers/eval-provider.ts
```

Best for: **regression testing** — ensuring that prompt changes don't break verdict logic, scores stay in range, hard-fail triggers actually fail.

#### Mode B — White-box / Prompt-only (Built-in OpenRouter Provider)

Use promptfoo's `openrouter:<model>` provider with the exported `SYSTEM_PROMPT` as a prompt file. This bypasses the Vercel AI SDK wrapper and calls the model directly.

```yaml
providers:
  - openrouter:openai/gpt-4.1-nano

prompts:
  - file://./prompts/system.txt # contains SYSTEM_PROMPT export value
```

Best for: **prompt iteration** — comparing different system prompt versions side-by-side without needing the SDK.

**Recommendation**: Start with Mode A (black-box). It requires less scaffolding, tests the real agent, and can be extended to Mode B for prompt comparison later.

### 5. Assertions Strategy

The `Review` type has 7 fields. Assertions should cover:

```yaml
assert:
  # Structural validity
  - type: is-json

  # Verdict matches expected
  - type: javascript
    value: JSON.parse(output).verdict === 'fail' # or 'pass'

  # Scores in valid range
  - type: javascript
    value: |
      const r = JSON.parse(output);
      const scores = [r.islandContract, r.tailwindConventions, r.supabaseSecurity, r.testCoverage, r.workerCompatibility];
      return scores.every(s => Number.isInteger(s) && s >= 1 && s <= 10);

  # Hard-fail criterion triggered (score ≤ 4 → verdict must be 'fail')
  - type: javascript
    value: |
      const r = JSON.parse(output);
      const hasHardFail = [r.islandContract, r.tailwindConventions, r.supabaseSecurity, r.testCoverage, r.workerCompatibility].some(s => s < 5);
      return !hasHardFail || r.verdict === 'fail';

  # Summary is non-empty markdown
  - type: javascript
    value: typeof JSON.parse(output).summary === 'string' && JSON.parse(output).summary.length > 20
```

For LLM-graded rubric assertions (checking _quality_ of the summary text), use `type: llm-rubric` with a model judge.

### 6. Proposed Eval Folder Structure

```
packages/code-reviewer/
├── evals/
│   ├── promptfooconfig.yaml       ← main config
│   ├── providers/
│   │   └── eval-provider.ts       ← wraps reviewDiff()
│   ├── fixtures/
│   │   ├── pass-clean-refactor.diff   ← no violations, expect verdict:pass
│   │   ├── fail-use-client.diff       ← "use client" in diff, expect islandContract ≤ 4
│   │   ├── fail-no-rls.diff           ← migration without RLS, expect supabaseSecurity ≤ 4
│   │   ├── fail-service-role.diff     ← service_role key leak, expect supabaseSecurity ≤ 4
│   │   ├── fail-cn-bypass.diff        ← template-literal class join, expect tailwindConventions ≤ 4
│   │   └── fail-process-env.diff      ← process.env in API route, expect workerCompatibility ≤ 4
│   └── assertions/
│       └── score-invariants.js    ← shared assertion helpers
└── package.json                   ← add "eval": "promptfoo eval -c evals/promptfooconfig.yaml"
```

### 7. Minimal `promptfooconfig.yaml` Shape

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: "MealDraft code-reviewer agent evals"

providers:
  - id: file://./providers/eval-provider.ts

prompts:
  - "{{diff}}" # diff passed as-is; provider wraps in <diff_content> via reviewDiff()

tests:
  - description: "Clean refactor — no violations"
    vars:
      diff: "file://./fixtures/pass-clean-refactor.diff"
    assert:
      - type: is-json
      - type: javascript
        value: JSON.parse(output).verdict === 'pass'
      - type: javascript
        value: JSON.parse(output).islandContract >= 8

  - description: "Hard fail — use client directive present"
    vars:
      diff: "file://./fixtures/fail-use-client.diff"
    assert:
      - type: is-json
      - type: javascript
        value: JSON.parse(output).verdict === 'fail'
      - type: javascript
        value: JSON.parse(output).islandContract <= 4
```

### 8. Environment Setup

promptfoo evals need `OPENROUTER_API_KEY`. The package already has a `src/.env.example`. Add a parallel `evals/.env.example`:

```
OPENROUTER_API_KEY=
REVIEW_MODEL=anthropic/claude-haiku-4.5   # eval-selected default for CLI
```

The eval provider should call `loadPackageEnv()` at init time (or use `dotenv` directly) so the evals work standalone without requiring the user to set global env vars.

### 9. Existing Test Infrastructure — What Evals Do NOT Inherit

The monorepo's Vitest setup (`vitest.config.ts:20`) only covers `tests/**/*.test.ts` and `src/**/*.test.ts`. The root `tsconfig.json` explicitly excludes `packages/`. `packages/code-reviewer` is **not** a pnpm workspace member (`pnpm-workspace.yaml` has no `packages:` array). This means:

- Evals need their own `promptfoo` dev dependency in `packages/code-reviewer/package.json`.
- No Vitest config needed — promptfoo is a separate runner.
- No pre-commit hook interference — lint-staged's `vitest related` won't pick up eval fixtures.
- The existing `"typecheck": "tsc --noEmit"` script should still pass (eval provider files live outside `src/`; add them to `tsconfig.json`'s `include` or use a separate `tsconfig.evals.json`).

---

## Code References

- `packages/code-reviewer/src/index.ts:1-4` — barrel export (all eval-importable symbols)
- `packages/code-reviewer/src/agents/reviewer.ts:20-33` — `reviewDiff()` — primary eval entry point
- `packages/code-reviewer/src/prompts/review.ts:1-51` — `SYSTEM_PROMPT` with 5 criteria and hard-fail rules
- `packages/code-reviewer/src/prompts/review.ts:61-63` — `buildReviewPrompt()` with `<diff_content>` guard
- `packages/code-reviewer/src/schemas/review.ts:5-39` — `REVIEW_SCHEMA` — 5 score fields + verdict + summary
- `packages/code-reviewer/src/cli.ts:28-41` — `runReview()` — shows the production flow evals must replicate
- `packages/code-reviewer/package.json:7-8` — `"main": "./src/index.ts"` — importable from provider
- `packages/code-reviewer/tsconfig.json:1-16` — standalone, does not extend root tsconfig
- `context/changes/tool-loop-agent/plan.md:65` — explicit note: "Not adding promptfoo config/fixtures" in prior change

---

## Architecture Insights

1. **No side effects on import**: `loadPackageEnv()` is called only inside `main()` in `cli.ts`, not at module level. A promptfoo provider that imports `reviewDiff` will not trigger env loading or key validation until `callApi()` is invoked. Clean separation.

2. **`ToolLoopAgent` with `stopWhen: stepCountIs(2)`** (`agents/reviewer.ts:16`): the agent is capped at 2 steps (1 generation + 1 possible retry). Evals exercise this loop. If a fixture triggers the retry path, the eval will capture the final output, not the intermediate.

3. **Prompt injection guard** (`prompts/review.ts:62`): the `<diff_content>` envelope is already in `buildReviewPrompt()`. Eval fixtures passed as raw diff strings will be automatically wrapped — no fixture needs to include the tags.

4. **`REVIEW_MODEL` env override** (`provider/openrouter.ts:6`): default is `anthropic/claude-haiku-4.5` (eval-selected 2026-06-21). Eval harness compares `gpt-4o-mini`, haiku, and `claude-sonnet-4.6` via per-provider `config.model` without mutating env.

5. **Standalone package, no workspace link**: promptfoo and fixtures stay inside `packages/code-reviewer/` and don't pollute the main app's dependency tree.

---

## Historical Context

- `context/changes/tool-loop-agent/plan.md:65` — The prior refactor change explicitly excluded promptfoo: "Adding or configuring promptfoo (`promptfooconfig.yaml`, fixtures, eval scripts)" was in the "What We're NOT Doing" section. This change (`code-review-evals`) is the intended follow-up.

---

## Open Questions

1. **Fixture curation strategy**: Which diffs make the best test cases? Options: (a) synthetic minimal diffs that trigger exactly one hard-fail, (b) real past PR diffs from `git log`, (c) adversarial diffs (prompt injection attempts in diff content). All three are useful at different stages.

2. **CI integration tier**: Should evals run as a new Tier 4 in `.github/workflows/ci.yml` (same-repo PRs only, needs `OPENROUTER_API_KEY` secret), or stay local-only initially? Cost vs. signal trade-off.

3. **Model judge for summary quality**: `type: llm-rubric` enables grading the `summary` field's actionability. Which model should judge? Using a different model than the reviewer avoids self-grading bias.

4. **Threshold policy for scores**: Should evals assert exact score values (brittle) or score ranges (e.g., `islandContract >= 8` for a clean pass)? Ranges are more resilient to model non-determinism.

5. **`tsconfig.json` scope for eval provider**: The current `tsconfig.json` only includes `src/**/*.ts`. Either extend `include` to cover `evals/**/*.ts`, or add a `tsconfig.evals.json` that extends the package tsconfig. The latter keeps type-checking scopes separate.
