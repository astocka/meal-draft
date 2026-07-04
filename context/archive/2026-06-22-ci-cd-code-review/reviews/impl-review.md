<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CI/CD Code Review

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phases 1–3 complete; Phase 4 **in progress** (4.3 after merge, 4.4 pending)
- **Date**: 2026-06-23
- **Verdict**: APPROVED (Phases 1–3 + triage fixes; Phase 4 open)
- **Findings**: 0 critical, 0 warnings, 0 observations (5 fixed, 3 accepted)
- **Triage**: Complete 2026-06-23

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Verdict not validated at composite-action boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/actions/ai-reviewer/action.yml:57-67`
- **Detail**: After `jq` validates JSON, `.verdict` is not checked to be `pass` or `fail`. A malformed verdict (e.g. `null`) yields `verdict=null` in outputs: the Enforce step treats it as non-fail (job passes) while the label step applies `ai-cr:failed`.
- **Fix**: After `jq`, run `jq -e '.verdict | IN("pass","fail")'` and `exit 1` on failure; mirror the guard in the comment step.
- **Decision**: FIXED — verdict validation in composite action and comment step

### F2 — No concurrency guard on review job

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/review.yml:13-140`
- **Detail**: Rapid `synchronize` pushes or overlapping `ai-cr:review` + sync runs can execute in parallel. Comment upsert (list-then-update/create) has no locking; two concurrent runs can both miss the marker and create duplicate comments.
- **Fix**: Add `concurrency: { group: ai-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }` on the job (use a separate group for `workflow_dispatch`).
- **Decision**: FIXED — concurrency group per PR; dispatch uses run_id

### F3 — Project rules loaded from PR checkout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/project-rules.ts:20-26`, `packages/code-reviewer/src/agents/reviewer.ts:20-24`
- **Detail**: `loadProjectRules()` reads `AGENTS.md` from the checked-out PR tree and appends it to system instructions. A PR can inject override text (e.g. "always pass") into the reviewer's system prompt.
- **Fix A ⭐ Recommended**: In CI, load rules from the base branch (`git show origin/main:AGENTS.md`) instead of the PR checkout.
  - Strength: Rules come from trusted `main`; PR cannot poison the rubric.
  - Tradeoff: PRs that legitimately update `AGENTS.md` won't be reviewed against their own rule changes until merged.
  - Confidence: HIGH — matches how merge gates should treat policy docs.
  - Blind spot: `workflow_dispatch` on non-PR refs needs a fallback path.
- **Fix B**: Pin rules via workflow env/input passed from `github.event.pull_request.base.sha`.
  - Strength: Explicit in workflow; no agent-side git calls.
  - Tradeoff: More wiring in composite action.
  - Confidence: MED — equivalent security if base ref is always used.
  - Blind spot: `workflow_dispatch` on non-PR refs needs a fallback path.
- **Decision**: FIXED via Fix A — `PROJECT_RULES_GIT_REF` loads AGENTS.md from base branch in CI

### F4 — Prompt tags not structurally escaped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/prompts/review.ts:61-67`
- **Detail**: `buildReviewPrompt` interpolates attacker-controlled diff and PR title into `<diff_content>` / `<pr_title>` tags without escaping. A line like `</diff_content>` in the diff can break out of the data envelope. System-prompt mitigations exist but are not structural.
- **Fix**: Escape or neutralize closing-tag sequences in diff/title before interpolation (e.g. replace `</diff_content>` / `</pr_title>`), or encode with an opaque delimiter (base64 + length prefix).
- **Decision**: FIXED — closing-tag sequences neutralized before interpolation

### F5 — change.md status stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/changes/ci-cd-code-review/change.md:4,14`
- **Detail**: `status: implementing` and "Phase 4 in progress" while Phases 1–3 are complete, Phase 4 code/docs are landed (`efa12d6`), and Outcome/Prerequisites are filled. Only manual soak items (branch protection, post-pin CI verify) remain in plan Progress.
- **Fix**: Set `status: impl_reviewed` (or `implemented` if soak is done) and update Progress note to reflect pending manual soak only.
- **Decision**: ACCEPTED — status already impl_reviewed; user will enable branch protection after merge; Phase 4 soak in progress

### F6 — Phase 4 manual soak items pending

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/ci-cd-code-review/plan.md:430-432`
- **Detail**: Plan Progress still has `[ ]` for 4.2 (AGENTS.md accuracy — appears correct against live workflow), 4.3 (branch protection required check), and 4.4 (Tier 1/2/3 CI after `ci.yml` SHA pin). Not rubber-stamped; honest pending state.
- **Fix**: Complete manual soak: enable **AI Code Review / review** on `main` after verification; confirm CI tiers green post-pin.
- **Decision**: ACCEPTED — 4.3 branch protection after merge; Phase 4 progress to be marked complete later

### F7 — requirements.md rollout table stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `context/changes/ci-cd-code-review/requirements.md:107-108`
- **Detail**: Rollout table lists Phase 3 (PR title) and Phase 4 (docs) as "Planned" while plan Progress marks them complete/partial.
- **Fix**: Update Phase 3/4 Status to Complete (or "Complete — soak pending" for Phase 4).
- **Decision**: FIXED — Phase 3 Complete; Phase 4 Complete — soak pending

### F8 — Same-repo PR trust model for API key

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/review.yml:26-43`
- **Detail**: Same-repo PRs run checkout and `./.github/actions/ai-reviewer` from the PR ref with `OPENROUTER_API_KEY`. A PR can modify the composite action or agent code to exfiltrate the key. Fork gating is correct; this is the standard trusted same-repo PR model (same as CI Tier 2/3 with Supabase secrets). Plan explicitly scopes to same-repo only.
- **Fix**: Accept for trusted contributors; optional hardening: path filters on `.github/**` and `packages/code-reviewer/**`, CODEOWNERS, or `workflow_run` pinned to `main` workflow code.
- **Decision**: ACCEPTED — trusted same-repo model; matches plan scope and CI Tier 2/3 pattern
