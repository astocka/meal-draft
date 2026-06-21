# promptfoo Evals for `code-reviewer` — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Introduce promptfoo ≥ 0.122 to `packages/code-reviewer` to verify that the code-review agent correctly identifies real violations — not just that it produces a JSON blob. Without evals, changing the system prompt or swapping models carries no signal. This plan establishes a multi-model comparison harness with an LLM judge so future model and prompt decisions are data-driven.

## Starting Point

`packages/code-reviewer` has no test infrastructure. Its public barrel (`src/index.ts`) already exports `reviewDiff()` and all prompt primitives. The model is currently hard-wired to `process.env.REVIEW_MODEL`; per-provider model selection requires a backwards-compatible optional parameter on `createReviewerAgent()`.

## Desired End State

`pnpm eval` runs one realistic diff fixture (React 16→19 migration, 3 MealDraft violations) against three low-cost models in parallel. Each model's output is verified by four assertions: valid JSON, scores in range, static hard-fail score check, and an LLM judge (`gpt-4o`) confirming the summary names all three violations. The promptfoo comparison table becomes the reference for model selection.

## Key Decisions Made

| Decision               | Choice                                                              | Why (1 sentence)                                                                                     | Source          |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| Eval mode              | Custom TS provider wrapping `reviewDiff()` (Mode A)                 | Tests the exact production code path — same SDK, ToolLoopAgent, and structured output                | Research        |
| Fixture strategy       | One complex diff with 3 violations (not 5 simple triggers)          | Realistic scenario tests both scoring accuracy and summary quality simultaneously                    | User            |
| Fixture type           | 3 MealDraft-specific violations in a React 16→19 migration          | Maps 1:1 to 3 of the 5 reviewer criteria; plausible migration mistakes                               | User            |
| Embedded violations    | `"use client"` + template-literal class + `process.env`             | Covers islandContract, tailwindConventions, workerCompatibility — three distinct hard-fail rules     | User            |
| Tested models          | `gpt-4o-mini`, `claude-haiku-3.5`, `gemini-2.0-flash`               | Three cheap models from different families for meaningful cross-model comparison                     | Plan            |
| Judge model            | `openai/gpt-4o` via native OpenAI provider                          | Different family from all tested models (zero shared bias); most reliable promptfoo rubric evaluator | User            |
| Assertion style        | Static (score ranges) + LLM judge (summary quality)                 | Static = fast and cheap; judge = catches models that score correctly but explain poorly              | Research + User |
| CI integration         | Local-only initially                                                | Avoids secret management overhead before eval stability is proven                                    | User            |
| Model config threading | Optional `model?` param on `createReviewerAgent()` + `reviewDiff()` | Backwards-compatible; avoids `process.env` mutation between parallel provider calls                  | Plan            |

## Scope

**In scope:**

- `promptfoo` dev dep + `"eval"` + `"typecheck:evals"` scripts in `package.json`
- `tsconfig.evals.json` extending base tsconfig for `evals/**`
- Optional `model` parameter on `createReviewerAgent()` and `reviewDiff()` in production source
- `evals/providers/eval-provider.ts` — custom `ApiProvider` with per-config model support
- `evals/fixtures/react16-to-19-migration.diff` — 50–80 line realistic diff with 3 violations
- `evals/promptfooconfig.yaml` — 3 providers × 1 test case × 4 assertions

**Out of scope:**

- CI tier for eval runs
- Additional fixture files (more test cases deferred)
- Prompt-injection fixtures
- Mode B (raw OpenRouter provider, bypassing SDK)
- Any changes to the main Astro app or Vitest config

## Architecture / Approach

```
pnpm eval
  └─ promptfoo eval -c evals/promptfooconfig.yaml
       ├─ 3 providers (same file, different config.model)
       └─ 1 test case: vars.diff = file://./fixtures/react16-to-19-migration.diff
            for each provider:
              eval-provider.ts
                loadPackageEnv()  →  reviewDiff(diff, undefined, model)
                  └─ createReviewerAgent({ model })
                       └─ ToolLoopAgent → OpenRouter → structured Review JSON
              assertions:
                1. is-json
                2. scores in 1–10
                3. islandContract ≤ 4 && tailwindConventions ≤ 4 && workerCompatibility ≤ 4 && verdict === 'fail'
                4. llm-rubric → openai:gpt-4o verifies summary names all 3 violations
```

## Phases at a Glance

| Phase                      | What it delivers                                                 | Key risk                                                                           |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Bootstrap               | `pnpm eval` binary reachable; `tsconfig.evals.json`; env example | promptfoo < 0.122 — confirm version before writing provider                        |
| 2. Model-Config + Provider | Per-provider model threading; `eval-provider.ts` typechecks      | `loadPackageEnv()` called in constructor (too early) instead of `callApi()`        |
| 3. Fixture + Config        | `pnpm eval` passes all 18 assertions across 3 models             | LLM judge fails if summary is correct but doesn't explicitly name all 3 violations |

**Prerequisites:** `OPENROUTER_API_KEY` and `OPENAI_API_KEY` in `packages/code-reviewer/src/.env`
**Estimated effort:** ~1 session across 3 phases (~$0.03–$0.04 per full eval run)

## Open Risks & Assumptions

- **Model non-determinism on static assertions**: the three hard-fail criteria (score ≤ 4) are explicit rule triggers in the system prompt; they should be stable, but a borderline fixture wording could push a model to score 5 (conservative) vs 4 (hard-fail). Tighten the fixture context if this happens.
- **LLM judge strictness**: the rubric requires all three violations named. A model that identifies 2 of 3 will fail — this is intentional but may need rubric wording iteration if no model passes initially.
- **`OPENAI_API_KEY` dependency**: the `gpt-4o` judge uses the native OpenAI provider, not OpenRouter. If only an OpenRouter key is available, the judge can be swapped to `openrouter:openai/gpt-4o` at the cost of sharing the same rate-limit bucket.

## Success Criteria (Summary)

- `pnpm eval` runs clean; all three models show green across all four assertions
- The promptfoo comparison table reveals which low-cost models reliably identify all three MealDraft violations
- Two consecutive runs produce identical verdicts (confirms score stability)
