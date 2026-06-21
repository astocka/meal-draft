<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Tool Loop Agent Modular Refactor

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-18
- **Verdict**: NEEDS ATTENTION → **APPROVED** after triage (3 warnings fixed/deferred)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict    |
| ------------------- | ---------- |
| Plan Adherence      | WARNING ⚠️ |
| Scope Discipline    | PASS ✅    |
| Safety & Quality    | PASS ✅    |
| Architecture        | PASS ✅    |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria    | PASS ✅    |

## Findings

### F1 — reviewDiff omits null-output guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/agents/reviewer.ts:26
- **Detail**: Plan Phase 2 contract requires `reviewDiff` to throw if `output` is null. Implementation returns `output` directly (null guard removed during Phase 1 lint fix). TypeScript types `output` as always defined, but runtime failure could yield undefined stdout on CLI.
- **Fix**: Restore `if (output == null) throw new Error("Code review agent returned no structured output.")` before return.
  - Strength: Matches plan contract; fails loudly for promptfoo/CI consumers.
  - Tradeoff: ESLint `no-unnecessary-condition` may flag it — use `output == null` or narrow with runtime check comment.
  - Confidence: HIGH — explicit plan requirement.
  - Blind spot: Whether AI SDK ever returns null with `Output.object` in practice.
- **Decision**: FIXED (restored null guard with eslint-disable for SDK type overlap)

### F2 — Stale package-lock.json in pnpm monorepo

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/package-lock.json:16-26
- **Detail**: npm lockfile committed while root uses pnpm. Lock metadata is stale vs `package.json` (bin still `src/index.ts`, engines `>=18` vs `>=20.12` in package.json).
- **Fix A ⭐ Recommended**: Remove `package-lock.json`; document `pnpm install` inside package or add pnpm workspace entry later.
  - Strength: Aligns with monorepo tooling; avoids dual lockfile confusion.
  - Tradeoff: Standalone npm users need explicit docs.
  - Confidence: HIGH — root is pnpm-first per AGENTS.md.
  - Blind spot: Whether coursework requires npm lock for submission.
- **Fix B**: Regenerate lock with `npm install` in package and keep npm-only workflow documented in README.
  - Strength: Reproducible npm installs for the standalone package.
  - Tradeoff: Diverges from monorepo pnpm convention.
  - Confidence: MEDIUM.
  - Blind spot: CI does not yet install this package.
- **Decision**: FIXED via Fix A (removed package-lock.json)

### F3 — API key validated only in CLI, not library path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/provider/openrouter.ts:10-13
- **Detail**: `createOpenRouterProvider()` passes through `process.env.OPENROUTER_API_KEY` without validation. CLI guards via `requireApiKey()`; programmatic `reviewDiff()` callers get opaque provider errors.
- **Fix**: Add shared `requireOpenRouterApiKey()` called from `createOpenRouterProvider()` or at start of `reviewDiff`/`pingModel`.
- **Decision**: FIXED (`requireOpenRouterApiKey()` in provider/openrouter.ts)

### F4 — Progress rows lack commit SHAs

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/tool-loop-agent/plan.md:302-336
- **Detail**: All Progress items marked `[x]` but none carry ` — <sha>` suffixes. User skipped per-phase commits during implement; `/10x-archive` may warn on missing SHAs. Implementation itself is complete and committed via `/commit-changes`.
- **Fix**: Optionally append SHAs from commits `26e7ad6`, `aa8d125`, `7b4b1b0` to phase Progress rows for traceability.
- **Decision**: SKIPPED

### F5 — Score fields lack Zod 1–10 bounds

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/schemas/review.ts:6-11
- **Detail**: Scores use `z.number()` without range constraint (documented SDK limitation). Out-of-range model output passes validation.
- **Fix**: Accept as designed (prompt-enforced) or add `.refine()` post-parse in a future eval change.
- **Decision**: ACCEPTED (by design — prompt + field descriptions enforce 1–10)

### F6 — Diff prompt injection surface

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/prompts/review.ts:15-16
- **Detail**: User-supplied diff is concatenated into prompt without delimiters. Inherent to diff-review tools; acceptable for local/CI use on trusted git diffs.
- **Fix**: Defer; future hardening can wrap diff in XML/fence delimiters with untrusted-data instructions.
- **Decision**: DEFERRED (accepted risk for trusted git diffs)

## Triage summary (2026-06-18)

| ID  | Decision                                      |
| --- | --------------------------------------------- |
| F1  | FIXED — null-output guard restored            |
| F2  | FIXED via Fix A — removed package-lock.json   |
| F3  | FIXED — requireOpenRouterApiKey() in provider |
| F4  | SKIPPED                                       |
| F5  | ACCEPTED (by design)                          |
| F6  | DEFERRED                                      |

## Automated verification (re-run 2026-06-18)

| Command                                       | Result                             |
| --------------------------------------------- | ---------------------------------- |
| `cd packages/code-reviewer && pnpm typecheck` | PASS                               |
| `pnpm exec eslint packages/code-reviewer`     | PASS                               |
| Barrel import smoke test                      | PASS (`function string schema-ok`) |

## Manual verification

All Manual Progress items `[x]`.

| Check                                            | Result                                                         | Date                            |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------- |
| `pnpm ping` — OpenRouter connectivity            | PASS (`openai/gpt-4.1-nano`, reply `ok`)                       | 2026-06-18                      |
| `pnpm review` — simulated diff (agent-generated) | PASS — valid `REVIEW_SCHEMA` JSON (5 scores, verdict, summary) | 2026-06-18                      |
| Barrel import smoke test                         | PASS                                                           | 2026-06-18 (impl review re-run) |
| `index.ts` import — no CLI side effects          | PASS                                                           | 2026-06-18 (initial implement)  |
