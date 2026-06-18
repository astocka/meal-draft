# Tool Loop Agent Modular Refactor — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Reorganize `packages/code-reviewer` into compact domain modules so prompts, schemas, provider, and the `ToolLoopAgent` factory are separately importable. This prepares the package for future promptfoo evals without changing review behavior or adding eval config in this slice.

## Starting Point

The package already uses `ToolLoopAgent` + structured output in `reviewer.ts`, with `index.ts` as a thin CLI. `schema.ts` mixes prompts and schema; `model.ts` holds OpenRouter wiring; `ping-cli.ts` duplicates CLI boilerplate for a connectivity check.

## Desired End State

```text
src/
  agents/reviewer.ts       # createReviewerAgent, reviewDiff
  prompts/review.ts        # SYSTEM_PROMPT, buildInstructions, buildReviewPrompt
  provider/openrouter.ts   # provider, model resolution, pingModel
  schemas/review.ts        # REVIEW_SCHEMA, Review
  project-rules.ts         # AGENTS.md discovery
  cli.ts                   # review (stdin) + ping subcommand
  index.ts                 # barrel only
  load-env.ts
```

Same stdin → JSON review flow; `pnpm ping` runs via `cli.ts ping`. Five criteria; OpenRouter provider.

## Key Decisions Made

| Decision        | Choice                                                                   | Why (1 sentence)                                                                         | Source |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------ |
| Module layout   | Domain tree (`agents/reviewer`, `prompts/review`, `provider/openrouter`) | Fits a single-purpose package better than generic `system.ts` / `instructions.ts` splits | Plan   |
| Agent module    | `agents/reviewer.ts` holds factory + `reviewDiff`                        | One review domain file; no separate `review.ts` wrapper                                  | Plan   |
| Tools folder    | Omitted — inline `tools: {}`                                             | No tools yet; add `tools/` when Deep Dive lands                                          | Plan   |
| Ping CLI        | Merged into `cli.ts ping`; delete `ping-cli.ts`                          | One entrypoint, shared env guard; `pingModel()` stays in provider                        | Plan   |
| Public exports  | Single barrel from package root                                          | Simplest import path for promptfoo custom providers                                      | Plan   |
| Build output    | Keep TypeScript source exports                                           | Eval change can decide on `dist/` later                                                  | Plan   |
| Review criteria | Keep 5 unchanged                                                         | Documentation criterion deferred                                                         | Plan   |
| Eval config     | Out of scope                                                             | Explicit user constraint                                                                 | Plan   |

## Scope

**In scope:**

- `prompts/review.ts`, `schemas/review.ts`, `provider/openrouter.ts`
- `agents/reviewer.ts`, `project-rules.ts`
- Unified `cli.ts` (review + ping); barrel `index.ts`
- Delete `schema.ts`, `reviewer.ts`, `model.ts`, `ping-cli.ts`

**Out of scope:**

- promptfoo config, fixtures, eval scripts
- `dist/` compilation
- Agent tools or loop expansion
- 6th documentation criterion
- CI review workflow

## Architecture / Approach

```
stdin diff → cli.ts review → reviewDiff() → createReviewerAgent()
                                    ↓
                          ToolLoopAgent.generate({
                            prompt: buildReviewPrompt(diff)
                          })
                                    ↓
                          Output.object(REVIEW_SCHEMA) → Review JSON

cli.ts ping → pingModel() in provider/openrouter.ts
```

Prompt composition: `buildInstructions(loadProjectRules())` merges `SYSTEM_PROMPT` + optional `AGENTS.md` content.

## Phases at a Glance

| Phase                         | What it delivers                                                   | Key risk                        |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| 1. Prompts, schema & provider | `prompts/review.ts`, `schemas/review.ts`, `provider/openrouter.ts` | Accidental prompt text drift    |
| 2. Agent & project rules      | `agents/reviewer.ts`, `project-rules.ts`                           | Broken import paths during move |
| 3. CLI, barrel & cleanup      | Unified `cli.ts`, `index.ts`, delete old files                     | CLI runs on library import      |

**Prerequisites:** `packages/code-reviewer` dependencies installed; `OPENROUTER_API_KEY` for manual smoke tests.

**Estimated effort:** ~1 session across 3 short phases.

## Open Risks & Assumptions

- No external consumers import old file paths directly (package is standalone).
- Promptfoo will consume TS source via `tsx` until a future build step.
- Score range (1–10) remains prompt-enforced, not Zod min/max.

## Success Criteria (Summary)

- `pnpm typecheck` passes; `pnpm ping` and `pnpm review` work as before.
- Barrel exposes `reviewDiff`, `createReviewerAgent`, schemas, and prompt builders without CLI side effects.
- No eval/promptfoo files added; `ping-cli.ts` removed.
