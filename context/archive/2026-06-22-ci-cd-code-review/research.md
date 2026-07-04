---
date: 2026-06-22T18:11:02+02:00
researcher: Cursor Agent
git_commit: 164e3a5c0c21acdfcb26d9fe05d223cb5acb5269
branch: feat/ci-cd-code-review
repository: meal-draft
topic: "CI/CD code review workflow vs requirements expectations"
tags: [research, codebase, github-actions, code-reviewer, ci-cd]
status: complete
last_updated: 2026-06-22
last_updated_by: Cursor Agent
last_updated_note: "Requirements aligned: implementation rubric, rollout phases, MVP input scope"
---

# Research: CI/CD code review workflow vs requirements expectations

**Date**: 2026-06-22T18:11:02+02:00  
**Researcher**: Cursor Agent  
**Git Commit**: `164e3a5c0c21acdfcb26d9fe05d223cb5acb5269`  
**Branch**: `feat/ci-cd-code-review`  
**Repository**: `astocka/meal-draft`

## Research Question

How does the current GitHub Actions + code-reviewer integration compare to the expectations in `context/changes/ci-cd-code-review/requirements.md`? What is implemented, what is missing, and what decisions are needed before planning?

## Summary

A **partial MVP** is already implemented on `feat/ci-cd-code-review`: a composite action pipes the PR git diff to `packages/code-reviewer`, posts a summary PR comment, and fails the job on `verdict: fail`. Core plumbing (workflow + composite action + OpenRouter secret + SHA-pinned third-party actions) matches the high-level concept in requirements.

**Major gaps vs requirements:**

| Area            | Requirements                                       | Current state                                                                   |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Target branch   | `main`                                             | ✅ `main` (`.github/workflows/review.yml:5`)                                    |
| Inputs          | Diff (MVP); title Phase 2; description deferred    | ✅ **Git diff only** (matches MVP scope)                                        |
| Criteria        | 6 generic (target rubric) + 5 stack-specific (MVP) | ✅ **5 stack-specific** documented in `requirements.md` § Implementation rubric |
| Labels          | `ai-cr:passed` / `ai-cr:failed`                    | **Phase 2** — not implemented                                                   |
| On-demand retry | Label `ai-cr:review`                               | **Phase 2** — not implemented                                                   |
| Parked criteria | business alignment, architectural fit              | Correctly absent                                                                |

**Recommendation for `/10x-plan`:** Ship Phase 1 (mostly done). Phase 2 adds labels + on-demand retry. Requirements and research are now aligned on criteria model and rollout phases.

## Detailed Findings

### 1. Workflow orchestration (`.github/workflows/review.yml`)

**Implemented correctly:**

- Triggers on `pull_request` to `main` and `workflow_dispatch` (`.github/workflows/review.yml:3-6`)
- Fork PR gating — same-repo only, matching CI Tier 2/3 pattern (`.github/workflows/review.yml:14`)
- Explicit least-privilege permissions: `contents: read`, `pull-requests: write` (`.github/workflows/review.yml:15-17`)
- Third-party actions SHA-pinned (`.github/workflows/review.yml:19-39`) — stricter than `ci.yml` which uses floating `@v4`
- pnpm install before agent run (`.github/workflows/review.yml:30`)
- PR comment upsert via `<!-- ai-code-review -->` marker (`.github/workflows/review.yml:37-87`)
- Job fails after comment on `verdict: fail` (`.github/workflows/review.yml:89-94`)

**Gaps vs requirements (Phase 1 MVP):**

- No label application (`requirements.md` Expected side-effects) — Phase 2
- No `pull_request` `labeled` trigger for `ai-cr:review` retry — Phase 2
- PR title/description not passed to agent — deferred per confirmed decisions

**Aligned with requirements:**

- Target branch `main` — requirements and workflow match
- Diff-only input — matches MVP scope in `requirements.md` § Input parameters
- Five stack-specific criteria — documented in `requirements.md` § Implementation rubric (MVP)

### 2. Composite action (`.github/actions/ai-reviewer/action.yml`)

**Implemented correctly:**

- Composite action pattern as required (`requirements.md:4`)
- Computes PR diff: `base.sha...head.sha` for PRs; `origin/main...HEAD` for manual dispatch (`.github/actions/ai-reviewer/action.yml:28-33`)
- Skips empty diffs with `verdict=skip` (`.github/actions/ai-reviewer/action.yml:35-38`)
- Pipes diff to `pnpm --filter code-reviewer review` (`.github/actions/ai-reviewer/action.yml:42`)
- Maps `OPENROUTER_API_KEY` from workflow secret (`.github/actions/ai-reviewer/action.yml:24`)
- Exposes `verdict` and `review-json` outputs for downstream steps (`.github/actions/ai-reviewer/action.yml:9-15`)
- Defers job failure to workflow so PR comment posts on fail (`.github/actions/ai-reviewer/action.yml:59-60`)

**Gaps:**

- No inputs for PR title or description
- No diff size truncation (cost/risk for large PRs — flagged in requirements as `??` for description cost)

### 3. Code reviewer agent (`packages/code-reviewer`)

**Scoring model** — five stack-specific criteria for MVP (see `requirements.md` § Implementation rubric):

| Schema field          | Maps to generic criteria                  |
| --------------------- | ----------------------------------------- |
| `islandContract`      | Idiomaticity, partial correctness         |
| `tailwindConventions` | Idiomaticity                              |
| `supabaseSecurity`    | Security and safety                       |
| `testCoverage`        | Test / risk coverage                      |
| `workerCompatibility` | Security and safety, partial idiomaticity |

**Not scored in MVP** (may appear in summary only): complexity, documentation — deferred to follow-up with new eval fixtures.

Scoring rules (`packages/code-reviewer/src/prompts/review.ts:6-15`, `packages/code-reviewer/src/schemas/review.ts:31-33`):

- Integer 1–10 per criterion
- Any score **< 5 → verdict must be `fail`**
- Hard-fail triggers → score ≤ 4
- Unverifiable from diff → score ≤ 5, flag in summary

CLI accepts **stdin diff only** (`packages/code-reviewer/src/cli.ts:28-36`). No flags for PR metadata. Programmatic `reviewDiff()` could accept extra context with small changes to `buildReviewPrompt()` (`packages/code-reviewer/src/prompts/review.ts:61-63`).

**AGENTS.md injection** works without workflow changes — loaded from repo root via `project-rules.ts` (`packages/code-reviewer/src/project-rules.ts:7-17`).

### 4. Security posture

| Control                          | Status                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| SHA-pinned remote actions        | ✅ in `review.yml`                                                           |
| No `pull_request_target`         | ✅ fork PRs skipped instead                                                  |
| Secret name `OPENROUTER_API_KEY` | ✅ matches CLI                                                               |
| Local composite action           | ✅ runs from checked-out ref (no external trust)                             |
| Prompt injection guard on diff   | ✅ `<diff_content>` tags + ignore-instructions rule (`prompts/review.ts:51`) |
| Required GitHub secret           | ⚠️ must be added manually in repo settings before first run                  |

### 5. Comparison with existing CI (`ci.yml`)

| Aspect               | `review.yml`              | `ci.yml`                    |
| -------------------- | ------------------------- | --------------------------- |
| Fork PRs             | Entire job skipped        | Tier 1 runs; Tier 2/3 gated |
| Action pinning       | SHA-pinned                | Floating `@v4`              |
| Explicit permissions | Yes                       | Default                     |
| Push to `main`       | No                        | Yes                         |
| Secrets              | `OPENROUTER_API_KEY` only | Supabase + test users       |

No eval CI tier exists — consistent with `code-review-evals` decision to stay local-only until eval stability is proven.

## Code References

- `.github/workflows/review.yml` — orchestrator: triggers, permissions, comment, enforce
- `.github/actions/ai-reviewer/action.yml` — diff extraction, agent invocation, outputs
- `packages/code-reviewer/src/schemas/review.ts:5-39` — structured output schema (5 criteria)
- `packages/code-reviewer/src/prompts/review.ts:1-51` — system prompt, calibration, hard-fail rules
- `packages/code-reviewer/src/cli.ts:28-40` — stdin diff → JSON stdout; exit 1 on fail
- `packages/code-reviewer/src/agents/reviewer.ts:8-33` — ToolLoopAgent factory + `reviewDiff()`
- `packages/code-reviewer/src/project-rules.ts:7-26` — AGENTS.md discovery
- `context/changes/ci-cd-code-review/requirements.md` — target spec, implementation rubric (MVP), rollout phases

## Architecture Insights

```
pull_request → review.yml
  ├── checkout (fetch-depth: 0)
  ├── pnpm install
  ├── ./.github/actions/ai-reviewer
  │     ├── git diff → /tmp/pr.diff
  │     └── pnpm --filter code-reviewer review < diff
  │           ├── SYSTEM_PROMPT (5 stack criteria)
  │           ├── AGENTS.md (if found)
  │           └── OpenRouter → structured JSON
  ├── github-script: upsert PR comment (scores + summary)
  └── bash: exit 1 if verdict=fail
```

The composite action cleanly separates **orchestration** (workflow) from **review execution** (action), matching the requirements concept. The agent package remains testable locally via `git diff main...HEAD | pnpm --filter code-reviewer review`.

## Historical Context (from prior changes)

- **`tool-loop-agent`** explicitly deferred wiring `.github/workflows/review.yml` (`context/changes/tool-loop-agent/plan.md:69`). Modular refactor + barrel export was prep work for evals and future CI.
- **`code-review-evals`** implemented promptfoo harness; **deferred CI tier** for evals — _"Avoids secret management overhead before eval stability is proven"_ (`context/changes/code-review-evals/plan-brief.md:29`). Selected **`anthropic/claude-haiku-4.5`** as default model.
- **`ci-cd-code-review/requirements.md`** — six generic criteria as target rubric; five stack-specific fields as MVP implementation (§ Implementation rubric); rollout phases and confirmed input scope

**Decision chain:**

```
tool-loop-agent (modular package, defer CI)
  → code-review-evals (promptfoo, defer eval CI, haiku default)
  → ci-cd-code-review (requirements + partial workflow implementation)
```

## Gap Analysis vs Requirements

### Implemented ✅

- [x] GHA workflow on PRs to `main` (`requirements.md`, `review.yml:5`)
- [x] Composite action for review logic
- [x] Git diff as MVP input
- [x] 1–10 scoring with < 5 = fail (5 stack-specific criteria)
- [x] PR comment with summary and score table
- [x] Job failure on fail verdict
- [x] Criteria model documented in requirements (generic target + MVP implementation rubric)

### Not implemented (Phase 2+) ❌

- [ ] PR title as input (Phase 3)
- [ ] PR description as input (deferred)
- [ ] Labels `ai-cr:passed` / `ai-cr:failed` (Phase 2)
- [ ] On-demand retry via `ai-cr:review` label (Phase 2)
- [ ] Scored complexity and documentation fields (follow-up change)
- [ ] Parked criteria: business alignment, architectural fit (correctly absent)

## Decisions

**Confirmed 2026-06-22** (user selections):

| #   | Decision          | Choice                                                                       |
| --- | ----------------- | ---------------------------------------------------------------------------- |
| 1   | Criteria model    | **Keep 5 stack-specific** — eval-validated; document mapping in requirements |
| 2   | PR metadata       | **Diff only for MVP** — title in Phase 2; description deferred               |
| 3   | Labels + retry    | **`labeled` trigger** on `ai-cr:review`                                      |
| 4   | Fork PRs          | **Keep skip** (recommended default)                                          |
| 5   | Branch protection | **Document check name** `"AI Code Review / review"`                          |

Recommendations and rationale for each choice:

### 1. Criteria model → **Keep 5 stack-specific; document mapping in requirements**

| Option                                      | Pros                                                                                                                 | Cons                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. Keep 5 stack-specific** ✅ recommended | Eval-validated (`code-review-evals`); hard-fail rules catch real MealDraft violations; no schema/prompt/eval rewrite | Doesn't match requirements' 6 generic headings verbatim                                    |
| B. Migrate to 6 generic                     | Matches requirements doc literally                                                                                   | Breaks eval fixtures; loses stack-specific hard-fails; full prompt/schema/workflow rewrite |
| C. Hybrid (6 generic + stack hard-fails)    | Best of both on paper                                                                                                | 11 dimensions or nested rubric — complex, expensive tokens, hard to eval                   |

**Recommendation:** Option A for this change. The 5 production criteria already cover most of the generic rubric:

| Generic (requirements)     | Covered by                                                     |
| -------------------------- | -------------------------------------------------------------- |
| Implementation correctness | Partially via hard-fail rules (RLS, env access, API routes)    |
| Idiomaticity               | `islandContract`, `tailwindConventions`, `workerCompatibility` |
| Complexity                 | **Gap** — not scored; agent may mention in summary only        |
| Test / risk coverage       | `testCoverage`                                                 |
| Documentation              | **Gap** — not scored; defer to follow-up                       |
| Security and safety        | `supabaseSecurity`, `workerCompatibility`                      |

**Action:** ✅ Done — `requirements.md` § Implementation rubric (MVP) documents the five fields and generic mapping. Complexity + documentation deferred to follow-up.

### 2. PR metadata → **Diff-only for MVP; title in Phase 2; description deferred**

| Option               | Recommendation                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Diff only (now)      | ✅ Ship MVP — lowest cost, matches what evals test                                            |
| + PR title (Phase 2) | ✅ Low token cost, helps intent-check; wire via env in composite action                       |
| + PR description     | ⏸ Defer — requirements already flag `?? cost tradeoff`; truncate to ~500 chars if added later |

### 3. Labels + retry → **`labeled` trigger with `ai-cr:review` filter**

| Option                                                        | Recommendation                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| **`pull_request` `types: [labeled]`** + filter `ai-cr:review` | ✅ Matches requirements (`requirements.md:82`); familiar UX |
| Separate `workflow_dispatch`                                  | ❌ Doesn't match requirements; worse discoverability        |
| Comment command (`/ai-review`)                                | ❌ Not in requirements; more implementation                 |

Also apply `ai-cr:passed` / `ai-cr:failed` labels after each run (`requirements.md:78`). Remove stale label before re-run on retry.

### 4. Fork PRs → **Keep skip**

| Option                      | Recommendation                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| **Skip fork PRs** (current) | ✅ Secrets unavailable to fork workflows; avoids `pull_request_target` supply-chain risk |
| Read-only review on forks   | ❌ Requires `pull_request_target` or no-secret mock — not worth complexity for MVP       |

Fork PRs still get CI Tier 1 (lint/build). Full AI review requires same-repo PR or local `pnpm review`.

### 5. Branch protection → **Document check name; configure manually in GitHub UI**

Required status check name once merged: **`review`** (job) under workflow **`AI Code Review`**.

GitHub displays this as **"AI Code Review / review"** in branch protection settings. Not enforceable from repo files — add to `AGENTS.md` and plan verification step after first merge to `main`.

### Out of scope for this change

- **Eval CI (Tier 4):** Separate follow-up per `code-review-evals` — eval stability not yet proven in CI.
- **SHA-pin `ci.yml`:** Good hygiene but unrelated to code review; own change if desired.

## Related Research

- `context/changes/tool-loop-agent/plan.md` — modular package refactor; CI deferred
- `context/changes/code-review-evals/research.md` — promptfoo integration; open CI tier question (§295)
- `context/changes/code-review-evals/change.md` — eval outcomes, haiku default model

## Open Questions

Resolved by Decisions section above unless marked open:

1. ~~Criteria model~~ → **Keep 5 stack-specific; document mapping in requirements**
2. ~~PR metadata~~ → **Diff-only MVP; title Phase 2; description deferred**
3. ~~Labels + retry~~ → **`labeled` trigger + `ai-cr:review` filter**
4. ~~Fork PRs~~ → **Keep skip**
5. ~~Branch protection~~ → **Document "AI Code Review / review" check name**

Still open:

- Token budget cap for PR description if added later (suggest 500 chars as starting point)
- Whether complexity + documentation become scored fields in a follow-up change

## Recommended Plan Phases (for `/10x-plan`)

| Phase                          | Scope                                                                                   | Effort | Status                           |
| ------------------------------ | --------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| **1 — Ship MVP**               | Merge workflow; add `OPENROUTER_API_KEY` secret; verify on test PR; document check name | Low    | In progress (workflow committed) |
| **2 — Labels + retry**         | `ai-cr:passed`/`ai-cr:failed` labels; `labeled: ai-cr:review` trigger                   | Medium | Planned                          |
| **3 — PR title**               | Wire title into prompt (optional env in composite action)                               | Low    | Planned                          |
| **4 — Requirements alignment** | Implementation rubric + rollout phases in `requirements.md`                             | Low    | ✅ Done                          |
| **5 — Docs**                   | AGENTS.md CI section; branch protection setup note                                      | Low    | Planned                          |

**Deferred (separate changes):** PR description input, complexity/documentation scored fields, eval CI tier, SHA-pin `ci.yml`.
