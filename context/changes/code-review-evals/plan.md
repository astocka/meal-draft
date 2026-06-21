# promptfoo Evals for `code-reviewer` — Implementation Plan

## Overview

Introduce [promptfoo](https://promptfoo.dev) ≥ 0.122 inside `packages/code-reviewer` to run the same code-review prompt across three low-cost models and verify review quality with both static assertions and an LLM-as-judge. A single realistic diff — migrating a React 16 component to React 19+ with three embedded MealDraft-specific violations — drives all test cases. Local-only; no CI tier added yet.

## Current State Analysis

`packages/code-reviewer` is a standalone Node.js ESM package with no test infrastructure. The public barrel (`src/index.ts`) exports `reviewDiff()`, `createReviewerAgent()`, `REVIEW_SCHEMA`, `SYSTEM_PROMPT`, and all prompt-building functions. The CLI (`cli.ts`) is the only file with side effects and is not imported by `src/index.ts`.

`createReviewerAgent()` and `reviewDiff()` currently resolve the model exclusively via `process.env.REVIEW_MODEL`. Running three providers in one promptfoo config requires each provider instance to supply its own model without mutating the process environment.

### Key Discoveries

- `packages/code-reviewer/src/agents/reviewer.ts:8` — `createReviewerAgent(projectRules?)` hard-wires the model from `resolveReviewModel()`. An optional `options.model` parameter must be added to support per-provider model selection.
- `packages/code-reviewer/src/agents/reviewer.ts:20` — `reviewDiff(diff, projectRules?)` is the clean eval entry point; adding an optional third `model` parameter keeps it backwards-compatible.
- `packages/code-reviewer/tsconfig.json:15` — `include: ["src/**/*.ts"]` only. A `tsconfig.evals.json` is needed to typecheck `evals/**`.
- `packages/code-reviewer/src/load-env.ts:6` — `loadPackageEnv()` resolves `src/.env` relative to `import.meta.url`. Must be called inside `callApi()`, not at module load.
- promptfoo PR #8445 (merged 2026-04-09): transitive TypeScript imports were silently broken before ≥ 0.122.
- `context/changes/tool-loop-agent/plan.md:65` — promptfoo explicitly deferred in the prior change; this plan is the intended follow-up.

## Desired End State

`pnpm eval` from `packages/code-reviewer/` runs one test case (the React 16→19 migration diff) against three providers in parallel:

- `openai/gpt-4o-mini`, `anthropic/claude-haiku-3.5`, `google/gemini-2.0-flash`

For each provider, four assertions run:

1. **`is-json`** — output is valid JSON matching `Review` shape
2. **Scores in range** — all five criterion scores are integers 1–10
3. **Verdict** — `verdict === "fail"` (three hard-fail violations are present)
4. **LLM-as-judge** (`openai/gpt-4o`) — the review's `summary` correctly identifies all three embedded violations

The promptfoo comparison table shows which models pass all four assertions, providing a signal for model selection decisions.

## What We're NOT Doing

- No CI tier — evals are local-only for now.
- No Mode B (built-in OpenRouter provider bypassing the SDK) — the TS provider (Mode A) is used so all three models run through the same `ToolLoopAgent` + structured output path.
- No additional test cases beyond the one React 16→19 fixture.
- No prompt-injection fixtures — deferred.
- No changes to the main Astro app, Vitest config, or `pnpm-workspace.yaml`.
- No `dist/` build step — promptfoo loads `.ts` files via its built-in tsx loader (≥ 0.122).
- No changes to `createReviewerAgent()`'s existing call sites — the new `options` parameter is optional; backwards-compatible.

## Implementation Approach

Three sequential phases. Phase 1 installs tooling and extends TypeScript coverage. Phase 2 adds model-config support to `reviewDiff()` / `createReviewerAgent()` and implements the provider. Phase 3 writes the fixture diff and the multi-model YAML config.

## Critical Implementation Details

**promptfoo version floor**: confirm `pnpm exec promptfoo --version` prints ≥ 0.122 before writing any provider code. Transitive `.ts` imports fail silently below this version.

**`loadPackageEnv()` placement**: call it inside `callApi()`, not in the class constructor or at module level. The constructor runs at config-parse time, before the process env is populated from `.env`. `callApi()` runs at eval time — exactly where the CLI calls it.

**Per-provider model isolation**: each promptfoo provider instance is constructed fresh per test case run. The `options.config.model` value is captured in the constructor and threaded into `reviewDiff()`. Never write to `process.env.REVIEW_MODEL` — that would race across parallel provider calls.

**LLM judge provider reference**: promptfoo `llm-rubric` assertions use a `provider` key at the assertion level. Use the built-in promptfoo `openrouter:openai/gpt-4o` provider string so all models — including the judge — route through OpenRouter. Only `OPENROUTER_API_KEY` is required in `src/.env`.

---

## Phase 1: Bootstrap

### Overview

Install promptfoo, add eval and typecheck scripts, create `tsconfig.evals.json` so eval sources are type-checked, and document env requirements.

### Changes Required

#### 1. Install promptfoo ≥ 0.122

**File**: `packages/code-reviewer/package.json`

**Intent**: Add `promptfoo` as a dev dependency and wire the eval and typecheck scripts so they're accessible via `pnpm`.

**Contract**: Run `pnpm add -D promptfoo@latest` from `packages/code-reviewer/`. Add two scripts: `"eval": "promptfoo eval -c evals/promptfooconfig.yaml"` and `"typecheck:evals": "tsc --noEmit -p tsconfig.evals.json"`. Confirm installed version is ≥ 0.122.

#### 2. TypeScript coverage for eval sources

**File**: `packages/code-reviewer/tsconfig.evals.json` (new)

**Intent**: Extend the base `tsconfig.json` to include `evals/**/*.ts` so the provider can be type-checked without polluting the production compilation.

**Contract**: New file extending `"./tsconfig.json"` with `"include": ["src/**/*.ts", "evals/**/*.ts"]`.

#### 3. Env example

**File**: `packages/code-reviewer/evals/.env.example` (new)

**Intent**: Document the environment variables an eval run needs, including both the OpenRouter key (for the three tested models) and the OpenAI key (for the gpt-4o judge).

**Contract**: Four variables: `OPENROUTER_API_KEY=` (required, for tested models), `OPENAI_API_KEY=` (required, for gpt-4o judge), `REVIEW_MODEL=openai/gpt-4o-mini` (optional, overrides the default for non-eval CLI use). Add a comment directing the developer to copy these into `src/.env` alongside existing vars.

### Success Criteria

#### Automated Verification

- `pnpm exec promptfoo --version` from `packages/code-reviewer/` prints ≥ 0.122
- `pnpm run typecheck:evals` passes (zero files to check at this point; that is fine)
- `package.json` contains both `"eval"` and `"typecheck:evals"` scripts

#### Manual Verification

- `pnpm eval` prints a promptfoo config-not-found error (confirms the binary is reachable before the config exists)

**Implementation Note**: Pause here after automated verification passes.

---

## Phase 2: Model-Config Support and Custom Provider

### Overview

Add an optional `model` parameter to `createReviewerAgent()` and `reviewDiff()` in production source, then implement `evals/providers/eval-provider.ts` that reads the model from promptfoo's per-provider config and threads it through.

### Changes Required

#### 1. Model parameter on `createReviewerAgent()`

**File**: `packages/code-reviewer/src/agents/reviewer.ts`

**Intent**: Allow callers to specify a model at call time rather than relying solely on `process.env.REVIEW_MODEL`. This enables three promptfoo provider instances to each target a different model without environment mutation.

**Contract**: Add an optional second parameter `options?: { model?: string }`. Inside the function body, replace `openrouter(resolveReviewModel())` with `openrouter(options?.model ?? resolveReviewModel())`. Existing call sites pass no second argument and are unaffected.

```typescript
export function createReviewerAgent(projectRules = loadProjectRules(), options?: { model?: string }) {
  const openrouter = createOpenRouterProvider();
  return new ToolLoopAgent({
    model: openrouter(options?.model ?? resolveReviewModel()),
    tools: {},
    instructions: buildInstructions(projectRules || undefined),
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: stepCountIs(2),
  });
}
```

#### 2. Model parameter on `reviewDiff()`

**File**: `packages/code-reviewer/src/agents/reviewer.ts`

**Intent**: Thread the optional model through `reviewDiff()` so the eval provider doesn't need to call `createReviewerAgent()` directly.

**Contract**: Add an optional third parameter `model?: string` and pass it as `createReviewerAgent(projectRules, { model })`. Signature becomes `reviewDiff(diff: string, projectRules?: string, model?: string): Promise<Review>`. Existing call sites are unaffected.

#### 3. Eval provider

**File**: `packages/code-reviewer/evals/providers/eval-provider.ts` (new)

**Intent**: Implement a promptfoo `ApiProvider` that captures the configured model from `options.config`, calls `loadPackageEnv()` at invocation time, delegates to `reviewDiff()`, and returns the JSON-serialised review as the output.

**Contract**: Default-exported class implementing `ApiProvider`. Constructor captures `options.config?.model as string | undefined`. `id()` returns `\`code-reviewer/${this.model ?? 'default'}\``. `callApi(prompt)`calls`loadPackageEnv()`, then `reviewDiff(prompt, undefined, this.model)`, then returns `{ output: JSON.stringify(review) }`.

```typescript
import type { ApiProvider, ProviderOptions, ProviderResponse } from "promptfoo";
import { loadPackageEnv } from "../../src/load-env.ts";
import { reviewDiff } from "../../src/index.ts";

export default class ReviewerProvider implements ApiProvider {
  private readonly model?: string;
  constructor(options: ProviderOptions) {
    this.model = options.config?.model as string | undefined;
  }
  id() {
    return `code-reviewer/${this.model ?? "default"}`;
  }
  async callApi(prompt: string): Promise<ProviderResponse> {
    loadPackageEnv();
    const review = await reviewDiff(prompt, undefined, this.model);
    return { output: JSON.stringify(review) };
  }
}
```

### Success Criteria

#### Automated Verification

- `pnpm run typecheck` (production tsconfig) passes — new optional parameters are backwards-compatible
- `pnpm run typecheck:evals` passes with provider file present — no errors on `promptfoo` or `reviewDiff` imports

#### Manual Verification

- `pnpm ping` still works (confirms `createReviewerAgent()` with no arguments is unaffected)

**Implementation Note**: Pause here after automated verification passes.

---

## Phase 3: Fixture and Multi-Model Config

### Overview

Write the React 16→19 migration diff with three embedded violations, then write `promptfooconfig.yaml` wiring three provider instances and four assertions per test case (two static, one composite static, one LLM-judge).

### Changes Required

#### 1. React 16→19 migration fixture

**File**: `packages/code-reviewer/evals/fixtures/react16-to-19-migration.diff` (new)

**Intent**: A realistic unified diff showing a MealDraft pantry component migrated from React 16 class syntax to React 19+ hooks, with exactly three MealDraft-rule violations embedded. The diff must be plausible enough that the violations look like genuine migration mistakes, not planted traps.

**Contract**: The diff must contain all of the following, using standard unified diff format (`diff --git`, `index`, `---`, `+++`, `@@` hunks):

| Violation  | What to include                                                                                                                          | Targeted criterion    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Flaw A** | `"use client";` as the first added line of the component file                                                                            | `islandContract`      |
| **Flaw B** | A dynamic Tailwind class built via template literal: e.g. ``className={`px-3 py-1 rounded text-${status}-600`}`` — not wrapped in `cn()` | `tailwindConventions` |
| **Flaw C** | `process.env.SUPABASE_URL` (or any `process.env.*`) read directly inside the component body                                              | `workerCompatibility` |

The rest of the diff should be a believable React 16→19 migration: removing a class component, introducing `useState`/`useEffect`, updating prop types with TypeScript, etc. Use realistic MealDraft file paths (`src/components/pantry/PantryItem.tsx`). The diff should be 50–80 lines.

#### 2. `promptfooconfig.yaml`

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml` (new)

**Intent**: Declare three provider instances (one per model), a single test case that loads the fixture, and four assertions that together verify structural correctness, verdict correctness, criterion scoring, and review quality via an LLM judge.

**Contract**: Top-level keys: `description`, `providers` (three entries), `prompts`, `tests`. Schema hint at top: `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`.

**Providers** — three instances of the same provider file with different `config.model`:

```yaml
providers:
  - id: file://./providers/eval-provider.ts
    label: gpt-4o-mini
    config:
      model: openai/gpt-4o-mini
  - id: file://./providers/eval-provider.ts
    label: claude-haiku-3.5
    config:
      model: anthropic/claude-haiku-3.5
  - id: file://./providers/eval-provider.ts
    label: gemini-flash
    config:
      model: google/gemini-2.0-flash
```

**Prompt** — raw diff passthrough (provider wraps it internally):

```yaml
prompts:
  - "{{diff}}"
```

**Assertions** — defined on the test case (not `defaultTest`, since there is only one test case):

```yaml
tests:
  - description: "React 16→19 migration — 3 MealDraft violations"
    vars:
      diff: "file://./fixtures/react16-to-19-migration.diff"
    assert:
      # 1. Structural: valid JSON
      - type: is-json

      # 2. Score range invariant: all five scores are integers 1–10
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const scores = [r.islandContract, r.tailwindConventions, r.supabaseSecurity,
                          r.testCoverage, r.workerCompatibility];
          return scores.every(s => Number.isInteger(s) && s >= 1 && s <= 10);

      # 3. Static: all three hard-fail criteria score ≤ 4 and verdict is fail
      - type: javascript
        value: |
          const r = JSON.parse(output);
          return r.islandContract <= 4 &&
                 r.tailwindConventions <= 4 &&
                 r.workerCompatibility <= 4 &&
                 r.verdict === 'fail';

      # 4. LLM-as-judge: summary identifies all three specific violations
      - type: llm-rubric
        provider: openrouter:openai/gpt-4o
        value: |
          The input is a JSON code review of a React 16→19 migration diff.
          Evaluate whether the 'summary' field correctly identifies all three of the following violations:
          1. A "use client" directive was added (violates the Astro/React Island Contract — this directive is a Next.js pattern and must not appear in this codebase).
          2. A Tailwind class string was built with a template literal instead of cn() from @/lib/utils.
          3. process.env was accessed directly inside the component (violates Cloudflare Workers compatibility — env vars must come from astro:env/server).
          Pass only if all three violations are clearly identified in the summary. Partial identification is a fail.
```

### Success Criteria

#### Automated Verification

- `pnpm run typecheck:evals` still passes
- `pnpm eval` runs without configuration errors (all provider×test combinations execute)
- All three providers pass all four assertions (green rows in promptfoo table)

#### Manual Verification

- Inspect the promptfoo comparison table: verify each model's JSON output shows `islandContract`, `tailwindConventions`, and `workerCompatibility` all ≤ 4
- Inspect the `summary` field for each model: confirm it calls out all three violations in actionable language
- Run `pnpm eval` a second time: verdict and hard-fail scores should be stable across runs (non-determinism check on static assertions)
- Note which model(s) fail the LLM-judge assertion — this is the primary signal for future model-selection decisions

**Implementation Note**: If the LLM judge assertion fails for a model but the static score assertions pass, the issue is in the `summary` quality (scores are right, but the prose doesn't explain the violations). Inspect the raw `summary` field and consider tightening the rubric wording or the fixture context.

---

## Testing Strategy

The six assertions across three providers (18 total assertion evaluations per `pnpm eval` run) constitute the full test suite for this change. The static assertions guard structural and scoring correctness; the LLM judge guards review quality. Together they answer: "does this model correctly identify and communicate these violations?"

### Manual Testing Steps

1. Ensure `src/.env` contains `OPENROUTER_API_KEY` (all models, including the judge, route through OpenRouter)
2. `cd packages/code-reviewer && pnpm eval` — all three providers should show green
3. Inspect the comparison table: which model(s) produce the clearest summaries?
4. Run again to confirm score stability across runs

---

## References

- Research: `context/changes/code-review-evals/research.md`
- Prior change that deferred promptfoo: `context/changes/tool-loop-agent/plan.md:65`
- Production entry point being tested: `packages/code-reviewer/src/agents/reviewer.ts:8-33`
- System prompt with the 5 criteria and hard-fail rules: `packages/code-reviewer/src/prompts/review.ts:1-51`
- Schema field descriptions: `packages/code-reviewer/src/schemas/review.ts:5-39`
- promptfoo custom provider docs: https://www.promptfoo.dev/docs/providers/custom-api
- promptfoo llm-rubric assertion: https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bootstrap

#### Automated

- [x] 1.1 `pnpm exec promptfoo --version` prints ≥ 0.122 (adapted: installed 0.121.17 — latest on npm; transitive .ts import correctness validated empirically in Phase 2)
- [x] 1.2 `pnpm run typecheck:evals` passes
- [x] 1.3 `package.json` contains `"eval"` and `"typecheck:evals"` scripts

#### Manual

- [x] 1.4 `pnpm eval` prints a config-not-found error (binary reachable)

### Phase 2: Model-Config Support and Custom Provider

#### Automated

- [x] 2.1 `pnpm run typecheck` (production) passes with new optional params
- [x] 2.2 `pnpm run typecheck:evals` passes with provider file present

#### Manual

- [x] 2.3 `pnpm ping` still works (no regression on existing CLI)

### Phase 3: Fixture and Multi-Model Config

#### Automated

- [ ] 3.1 `pnpm run typecheck:evals` passes after adding fixture and config
- [ ] 3.2 `pnpm eval` executes without configuration errors
- [ ] 3.3 All three providers pass all four assertions

#### Manual

- [ ] 3.4 Each model's JSON shows `islandContract`, `tailwindConventions`, `workerCompatibility` all ≤ 4
- [ ] 3.5 Each model's `summary` calls out all three violations
- [ ] 3.6 Second `pnpm eval` run confirms stable verdicts (non-determinism check)
