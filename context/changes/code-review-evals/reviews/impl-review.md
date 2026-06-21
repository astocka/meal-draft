<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: promptfoo Evals for `code-reviewer`

- **Plan**: context/changes/code-review-evals/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-21
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical, 4 warnings, 3 observations — all triaged

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Triage Summary

| ID  | Decision                                                  |
| --- | --------------------------------------------------------- |
| F1  | FIXED — change.md Outcome/Prerequisites/PRD refs          |
| F2  | FIXED — plan Phase 2 §4 ESLint addendum                   |
| F3  | FIXED — plan model IDs synced (SHAs skipped)              |
| F4  | FIXED — eval-provider try/catch + API key preflight       |
| F5  | FIXED — eval-provider requires config.model               |
| F6  | ACCEPTED — promptfoo 0.121.17 until 0.122 publishes       |
| F7  | ACCEPTED — assertion 3.3 model-selection signal by design |

## Findings

### F1 — change.md missing Outcome, Prerequisites, PRD refs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/code-review-evals/change.md
- **Detail**: `change.md` has only a one-line Notes entry. Team lesson requires Outcome, Prerequisites, and PRD refs for traceability.
- **Fix**: Add `### Outcome`, `### Prerequisites`, and `### PRD refs` under Notes per lessons.md.
- **Decision**: FIXED — added Outcome, Prerequisites, PRD refs to change.md

### F2 — ESLint evals config not in plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:114-126
- **Detail**: `codeReviewerEvalsConfig` block was added to fix pre-commit lint for `evals/**/*.ts`. Required for the provider to commit cleanly but not listed in any phase's Changes Required.
- **Fix A ⭐ Recommended**: Add a one-line note to plan Phase 1 or Phase 2 documenting the ESLint/tsconfig.evals pairing as a supporting change.
  - Strength: Preserves work; updates source of truth before archive.
  - Tradeoff: Plan becomes slightly moving target.
  - Confidence: HIGH — standard addendum pattern.
  - Blind spot: None significant.
- **Fix B**: Leave as-is; the change is benign and committed separately from p3.
  - Strength: No plan edit needed.
  - Tradeoff: Future reviewers won't know why root eslint.config.js changed.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — documented ESLint/tsconfig.evals pairing in plan Phase 2 §4

### F3 — Plan body still references original model IDs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/code-review-evals/plan.md:24-26, 232-239
- **Detail**: Plan body and YAML synced to `gpt-4o-mini`, `claude-haiku-4.5`, `claude-sonnet-4.6` (gemini removed 2026-06-21 for cheap-vs-premium matrix).
- **Decision**: FIXED — synced Desired End State and Phase 3 YAML; default `REVIEW_MODEL` set to haiku-4.5 post-eval

### F4 — Eval provider lacks structured error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/providers/eval-provider.ts:18-22
- **Detail**: `callApi()` has no try/catch. Missing API key, network errors, or null structured output bubble as unhandled rejections. CLI wraps top-level errors with readable messages; eval provider does not return `{ error: ... }` for promptfoo.
- **Fix**: Wrap `reviewDiff()` in try/catch; return `{ error: message }` on failure; optionally call `requireOpenRouterApiKey()` after `loadPackageEnv()` for fast preflight.
  - Strength: Clearer promptfoo table errors; matches CLI fail-fast intent.
  - Tradeoff: Small provider diff; not blocking local evals that already work.
  - Confidence: HIGH — promptfoo custom provider docs support error field.
  - Blind spot: Haven't verified promptfoo UI rendering of error vs output.
- **Decision**: FIXED — added try/catch + requireOpenRouterApiKey preflight in eval-provider.ts

### F5 — Missing config.model silently falls back to REVIEW_MODEL

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: packages/code-reviewer/evals/providers/eval-provider.ts:11, packages/code-reviewer/src/agents/reviewer.ts:12
- **Detail**: If a provider YAML entry omits `config.model`, eval falls back to `process.env.REVIEW_MODEL`, breaking parallel model comparison. Current YAML sets model on all three entries — footgun only.
- **Fix**: Throw in eval provider constructor when `config.model` is missing.
- **Decision**: FIXED — constructor throws if config.model absent; model field is now required string

### F6 — promptfoo pinned below documented floor

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/package.json:31
- **Detail**: Plan requires ≥0.122; installed 0.121.17 (npm latest). Progress documents adaptation; transitive .ts imports empirically work in Phase 2/3.
- **Fix**: No action until 0.122 publishes; re-check floor on next promptfoo upgrade.
- **Decision**: ACCEPTED — documented adaptation; re-check on next promptfoo upgrade

### F7 — Assertion 3.3 adapted (by design)

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Success Criteria
- **Location**: context/changes/code-review-evals/plan.md:366
- **Detail**: Eval complete (2026-06-21, sonnet lineup, `pnpm eval` ×2): haiku + sonnet PASS all assertions; gpt-4o-mini FAIL assertion 3 (run1 tailwind=6/worker=5, run2 tailwind=4/worker=5). Premium sonnet does not beat haiku on pass rate; haiku ~2× faster. **Default `REVIEW_MODEL`:** `anthropic/claude-haiku-4.5`.
- **Fix A ⭐ Recommended**: Accept as-is; eval is working as designed for local model comparison.
  - Strength: Preserves useful signal; no false sense that all cheap models are equivalent.
  - Tradeoff: `pnpm eval` exits 100 until models improve or assertions are relaxed.
  - Confidence: HIGH — user manually verified twice (stable pass/fail).
  - Blind spot: Model behavior may shift when OpenRouter routes change.
- **Fix B**: Relax assertion 3 to `verdict === 'fail'` only; keep score checks informational in manual steps.
  - Strength: All providers can go green on static checks.
  - Tradeoff: Loses automated hard-fail calibration gate.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: ACCEPTED via Fix A — eval working as designed; model-selection signal preserved
