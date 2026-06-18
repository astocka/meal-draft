# Tool Loop Agent Modular Refactor — Implementation Plan

## Overview

Reorganize `packages/code-reviewer` into a compact, domain-oriented module tree with prompts, schemas, provider, and agent in separate files, a reusable `ToolLoopAgent` factory, and a clean barrel export for future promptfoo custom providers. Behavior stays the same: single-shot diff review, five scoring criteria, OpenRouter provider, AGENTS.md injection. No eval configuration in this change.

## Current State Analysis

The package already uses `ToolLoopAgent` with `Output.object({ schema: REVIEW_SCHEMA })` and `stopWhen: stepCountIs(2))` in `reviewer.ts`. `index.ts` is a thin CLI shell that reads stdin and re-exports library symbols. `schema.ts` mixes the system prompt constant and Zod review schema — the primary split target. OpenRouter wiring lives in `model.ts`; connectivity smoke test lives in a separate `ping-cli.ts` duplicating CLI boilerplate. There is no `dist/` build; `package.json` exports TypeScript source directly. No promptfoo config exists yet.

### Key Discoveries:

- Agent logic lives in `packages/code-reviewer/src/reviewer.ts:34-58` (`createReviewerAgent`, `reviewDiff`).
- Prompt + schema coupling in `packages/code-reviewer/src/schema.ts:3-23` (`SYSTEM_PROMPT`, `REVIEW_SCHEMA`).
- Provider helpers in `packages/code-reviewer/src/model.ts` (`createOpenRouterProvider`, `resolveReviewModel`, `pingModel`).
- `ping-cli.ts` is a ~20-line duplicate of env-loading + API-key guard already needed by the review CLI.
- M5L3 lesson mentions a future 6th documentation criterion and promptfoo evals — explicitly deferred here.
- ESLint has a dedicated type-checked block for `packages/code-reviewer/**/*.ts` (`eslint.config.js:100-112`).

## Desired End State

After this change, `packages/code-reviewer` has this module tree:

```text
src/
  agents/reviewer.ts         # createReviewerAgent(), reviewDiff()
  prompts/review.ts          # SYSTEM_PROMPT, buildInstructions(), buildReviewPrompt()
  provider/openrouter.ts     # createOpenRouterProvider(), resolveReviewModel(), pingModel()
  schemas/review.ts          # REVIEW_SCHEMA, Review
  project-rules.ts           # resolveAgentsMdPath(), loadProjectRules()
  load-env.ts                # loadPackageEnv() — shared by cli.ts
  cli.ts                     # review (stdin → JSON) + ping subcommand
  index.ts                   # barrel exports only
```

Deleted: `schema.ts`, `reviewer.ts`, `model.ts`, `ping-cli.ts`.

Consumers (including future promptfoo providers) import from the package root:

```ts
import {
  reviewDiff,
  createReviewerAgent,
  SYSTEM_PROMPT,
  REVIEW_SCHEMA,
  buildInstructions,
  buildReviewPrompt,
} from "code-reviewer";
```

CLI behavior:

- `pnpm review` / `code-review` — read diff from stdin, print review JSON (default mode).
- `pnpm ping` — cheap OpenRouter connectivity check via `cli.ts ping` (no stdin).

### Verification

- `cd packages/code-reviewer && pnpm typecheck` passes.
- `pnpm ping` prints model + reply with valid `OPENROUTER_API_KEY`.
- Piped diff to `pnpm review` returns valid JSON matching `REVIEW_SCHEMA` (manual).
- No `reviewer.ts`, `schema.ts`, `model.ts`, or `ping-cli.ts` remain; no eval/promptfoo files added.

## What We're NOT Doing

- Adding or configuring promptfoo (`promptfooconfig.yaml`, fixtures, eval scripts).
- Adding a `dist/` build step or changing `exports` away from TypeScript source.
- Adding tools to the agent loop (readPlan, readImplReviewCriteria, etc.) — inline `tools: {}` in agent until needed.
- Adding the 6th documentation scoring criterion.
- Wiring CI review workflow (`.github/workflows/review.yml`).
- Changing the review model, provider, or `stopWhen` behavior.

## Implementation Approach

Pure refactor with file moves and thin extraction functions. Each phase lands independently verifiable via `pnpm typecheck`. Preserve all existing public symbol names on the barrel export. Domain-named modules (`review`, `openrouter`) over generic layers (`system`, `instructions`, `user`).

## Phase 1: Extract Prompts, Schema & Provider

### Overview

Split `schema.ts` into `prompts/review.ts` and `schemas/review.ts`. Move OpenRouter wiring from `model.ts` into `provider/openrouter.ts`.

### Changes Required:

#### 1. Review prompts module

**File**: `packages/code-reviewer/src/prompts/review.ts`

**Intent**: Own all review prompt strings and builders in one domain module for promptfoo reuse.

**Contract**: Export:

- `SYSTEM_PROMPT` — verbatim from `schema.ts:3-7`
- `buildInstructions(projectRules?: string): string` — returns `SYSTEM_PROMPT` when rules empty/undefined; otherwise `` `${SYSTEM_PROMPT}\n\nProject conventions:\n${projectRules}` ``
- `buildReviewPrompt(diff: string): string` — returns `` `Review this diff:\n\n${diff}` ``

#### 2. Review output schema

**File**: `packages/code-reviewer/src/schemas/review.ts`

**Intent**: Own the Zod structured-output schema and inferred TypeScript type.

**Contract**: Export `REVIEW_SCHEMA` (same five criteria + verdict + summary as `schema.ts:11-21`) and `type Review = z.infer<typeof REVIEW_SCHEMA>`. Preserve the comment about 1–10 range enforcement via descriptions, not Zod min/max.

#### 3. OpenRouter provider module

**File**: `packages/code-reviewer/src/provider/openrouter.ts`

**Intent**: Isolate provider construction, model resolution, and connectivity ping from agent logic.

**Contract**: Move from `model.ts`:

- `resolveReviewModel()` — `process.env.REVIEW_MODEL ?? "openai/gpt-4.1-nano"`
- `createOpenRouterProvider()` — `createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })`
- `pingModel()` — cheap `generateText` round-trip (unchanged behavior)

#### 4. Remove superseded files

**Files**: `packages/code-reviewer/src/schema.ts`, `packages/code-reviewer/src/model.ts`

**Intent**: Delete after all imports updated.

**Contract**: No remaining imports reference either file.

### Success Criteria:

#### Automated Verification:

- `cd packages/code-reviewer && pnpm typecheck` passes
- `pnpm run lint` passes for new modules

#### Manual Verification:

- `SYSTEM_PROMPT` text unchanged from pre-refactor
- `REVIEW_SCHEMA` field names and descriptions unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Extract Agent & Project Rules

### Overview

Move agent construction, `reviewDiff` wrapper, and AGENTS.md discovery into dedicated modules. Delete `reviewer.ts`.

### Changes Required:

#### 1. Project rules loader

**File**: `packages/code-reviewer/src/project-rules.ts`

**Intent**: Isolate filesystem discovery of `AGENTS.md` from agent logic.

**Contract**: Export `resolveAgentsMdPath(): string | undefined` and `loadProjectRules(): string` — same candidate roots and behavior as `reviewer.ts:12-32`.

#### 2. Reviewer agent module

**File**: `packages/code-reviewer/src/agents/reviewer.ts`

**Intent**: Own `ToolLoopAgent` construction and the one-shot `reviewDiff` API.

**Contract**: Export:

- `createReviewerAgent(projectRules?: string)` — `new ToolLoopAgent({ model: createOpenRouterProvider()(resolveReviewModel()), instructions: buildInstructions(projectRules ?? loadProjectRules()), tools: {}, output: Output.object({ schema: REVIEW_SCHEMA }), stopWhen: stepCountIs(2) })`
- `reviewDiff(diff: string, projectRules?: string): Promise<Review>` — creates agent, calls `generate({ prompt: buildReviewPrompt(diff) })`, throws if `output` is null

#### 3. Remove old reviewer file

**File**: `packages/code-reviewer/src/reviewer.ts`

**Intent**: Delete after imports updated.

**Contract**: File deleted; no remaining imports reference `./reviewer.ts`.

### Success Criteria:

#### Automated Verification:

- `cd packages/code-reviewer && pnpm typecheck` passes
- `pnpm run lint` passes for `packages/code-reviewer`

#### Manual Verification:

- Agent still uses `stopWhen: stepCountIs(2)` and `tools: {}` (no behavioral regression)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Unified CLI, Barrel & Cleanup

### Overview

Single `cli.ts` entry for review and ping modes. `index.ts` becomes library-only barrel. Remove `ping-cli.ts`.

### Changes Required:

#### 1. Unified CLI module

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: One entrypoint for all CLI operations — shared env loading and API-key guard.

**Contract**:

- Shebang + `isCliEntry` guard (only runs when executed directly).
- `loadPackageEnv()` on startup; exit 1 if `OPENROUTER_API_KEY` missing.
- **Default / `review` mode** (no subcommand or first arg `review`): read diff from stdin; if empty, exit 1 with usage hint; call `reviewDiff(diff)`; print JSON to stdout.
- **`ping` mode** (first arg `ping`): call `pingModel()` from `provider/openrouter.ts`; print `Model connection OK (${model})` and `Reply: ${reply}`.
- Unknown subcommand: print usage and exit 1.

#### 2. Library barrel

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Pure re-export surface — no CLI side effects when imported as a library.

**Contract**: Re-export:

- From `schemas/review.ts`: `REVIEW_SCHEMA`, `type Review`
- From `prompts/review.ts`: `SYSTEM_PROMPT`, `buildInstructions`, `buildReviewPrompt`
- From `agents/reviewer.ts`: `createReviewerAgent`, `reviewDiff`
- From `project-rules.ts`: `loadProjectRules`, `resolveAgentsMdPath`

Do not export `loadPackageEnv`, provider internals, or `pingModel`.

#### 3. Package manifest

**File**: `packages/code-reviewer/package.json`

**Intent**: Point all CLI scripts at `cli.ts`; remove `ping-cli.ts` reference.

**Contract**:

- `"bin": { "code-review": "./src/cli.ts" }`
- `"review"` / `"start"`: `tsx src/cli.ts`
- `"ping"`: `tsx src/cli.ts ping`
- `"exports": { ".": "./src/index.ts" }` unchanged

#### 4. Remove ping CLI file

**File**: `packages/code-reviewer/src/ping-cli.ts`

**Intent**: Delete — functionality merged into `cli.ts ping`.

**Contract**: File deleted.

### Success Criteria:

#### Automated Verification:

- `cd packages/code-reviewer && pnpm typecheck` passes
- `pnpm run lint` passes
- Import smoke: `pnpm exec tsx -e "import { reviewDiff, REVIEW_SCHEMA, SYSTEM_PROMPT } from './src/index.ts'; console.log(typeof reviewDiff, REVIEW_SCHEMA.shape.verdict)"` prints `function object`

#### Manual Verification:

- `pnpm ping` verifies OpenRouter connectivity
- Piped diff to `pnpm review` prints valid JSON with `verdict` and `summary`
- Importing `index.ts` does not trigger CLI execution or read stdin

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None in this change — behavior is unchanged; manual smoke tests suffice. Future `code-review-evals` change will add promptfoo assertions.

### Integration Tests:

- Not applicable — no cross-package wiring.

### Manual Testing Steps:

1. `cd packages/code-reviewer && pnpm typecheck`
2. `pnpm ping` with valid `OPENROUTER_API_KEY`
3. Pipe a small `git diff` to `pnpm review`; validate JSON against `REVIEW_SCHEMA.parse()`
4. `pnpm exec tsx -e "import './src/index.ts'"` — must not read stdin or exit

## Performance Considerations

No change — same single LLM call per review. Module split has zero runtime cost.

## Migration Notes

No consumer outside the package currently imports `code-reviewer` (standalone package, not in root workspaces). If any script used relative imports to `reviewer.ts`, `schema.ts`, or `model.ts`, update to barrel imports from `index.ts`.

## References

- Change notes: `context/changes/tool-loop-agent/change.md`
- ai-sdk skill: `packages/code-reviewer/.agents/skills/ai-sdk/SKILL.md`
- Current agent: `packages/code-reviewer/src/reviewer.ts`
- M5L3 lesson (future evals): `context/team/code-review-w-erze-ai-standardy-dod-i-agent-w-pipeline.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract Prompts, Schema & Provider

#### Automated

- [x] 1.1 `cd packages/code-reviewer && pnpm typecheck` passes
- [x] 1.2 Lint passes for new `prompts/`, `schemas/`, and `provider/` modules

#### Manual

- [x] 1.3 `SYSTEM_PROMPT` and `REVIEW_SCHEMA` content unchanged from pre-refactor

### Phase 2: Extract Agent & Project Rules

#### Automated

- [x] 2.1 `cd packages/code-reviewer && pnpm typecheck` passes
- [x] 2.2 `pnpm run lint` passes for `packages/code-reviewer`

#### Manual

- [x] 2.3 Agent still uses empty `tools: {}` and `stepCountIs(2)`

### Phase 3: Unified CLI, Barrel & Cleanup

#### Automated

- [x] 3.1 `cd packages/code-reviewer && pnpm typecheck` passes
- [x] 3.2 `pnpm run lint` passes
- [x] 3.3 Barrel import smoke test succeeds

#### Manual

- [x] 3.4 `pnpm ping` verifies OpenRouter connectivity via `cli.ts ping`
- [x] 3.5 `pnpm review` with piped diff returns valid review JSON
- [x] 3.6 Importing `index.ts` does not trigger CLI execution
