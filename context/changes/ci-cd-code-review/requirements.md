## Overall concept

- GHA workflow run for every new pull request to main branch
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

### MVP (Phase 1 — confirmed)

- git diff — **implemented**; piped from `git diff base.sha...head.sha` in composite action

### Phase 2

- pull request title — low token cost; wire via env in composite action

### Deferred

- pull request description — cost tradeoff (`??`); truncate to ~500 chars if added later

## Code Review Criteria

Each criterion is scored on a 1–10 integer scale. **1** means the worst plausible outcome for that dimension in this diff; **10** means exemplary — no issues found and nothing material left to verify from the diff alone. Any criterion below **5** should produce a **fail** verdict.

The six generic dimensions below describe the **target rubric** for human reviewers and future agent expansion. The **MVP agent** scores five MealDraft-specific fields instead — see [Implementation rubric (MVP)](#implementation-rubric-mvp).

### 1) Implementation correctness

Does the change do what it claims, handle edge cases sensibly, and avoid introducing bugs or regressions visible in the diff?

| Score  | Meaning                                                                                      |
| ------ | -------------------------------------------------------------------------------------------- |
| **1**  | Clear logic errors, broken behavior, or regressions — the change would not work as intended. |
| **10** | Correct, complete implementation; edge cases handled; no correctness concerns in the diff.   |

### 2) Idiomaticity

Does the code follow established patterns of the stack and this codebase rather than fighting them?

| Score  | Meaning                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------- |
| **1**  | Ignores project conventions, uses alien patterns, or reimplements what the stack already provides. |
| **10** | Reads naturally alongside existing code; naming, structure, and APIs match project idioms.         |

### 3) Complexity

Is the solution as simple as the problem allows — no unnecessary layers or cleverness?

| Score  | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| **1**  | Over-engineered, hard to follow, or abstracted beyond what the change requires.   |
| **10** | Minimal, clear structure; complexity is proportional to the problem being solved. |

### 4) Test / risk coverage

Are automated tests proportional to the risk the change introduces?

| Score  | Meaning                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------ |
| **1**  | High-risk paths (auth, data writes, parsing, RLS) changed or added with no relevant tests in the diff. |
| **10** | New or changed behavior is exercised by tests at the appropriate level (unit, integration, E2E).       |

### 5) Documentation

Are non-obvious decisions, APIs, config, or setup steps documented where the code alone is not enough?

| Score  | Meaning                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| **1**  | Public contracts, env vars, or operational steps are changed without any supporting docs or comments.              |
| **10** | Necessary context is captured (README, AGENTS.md, inline where truly non-obvious); obvious code stays uncommented. |

### 6) Security and safety

Does the change avoid weakening auth, leaking data, exposing secrets, or introducing unsafe defaults?

| Score  | Meaning                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------- |
| **1**  | Secrets in source, missing RLS, service-role keys, or other material security regressions.              |
| **10** | Least-privilege preserved; sensitive operations follow safe patterns; no security concerns in the diff. |

## Implementation rubric (MVP)

**Decision (2026-06-22):** Keep the five stack-specific criteria already implemented in `packages/code-reviewer` and validated by promptfoo evals. Do not migrate to the six generic headings for MVP — that would break eval fixtures and lose hard-fail rules.

The CI workflow posts a score table using these five fields. Schema: `packages/code-reviewer/src/schemas/review.ts`.

| Agent field           | What it checks                                                                                                  | Maps to generic criteria                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `islandContract`      | No `use client`/`use server`; API routes export `prerender = false`; React only for interactive islands         | Idiomaticity, partial correctness         |
| `tailwindConventions` | Conditional/concatenated classes use `cn()`; no template-literal class joins; no inline `style={{}}` for layout | Idiomaticity                              |
| `supabaseSecurity`    | RLS on new tables; no `service_role` key; migration naming; auth via `@supabase/ssr`                            | Security and safety                       |
| `testCoverage`        | RLS → Vitest integration tests; `generation.ts` changes → fixture tests; data writes → isolated E2E             | Test / risk coverage                      |
| `workerCompatibility` | No Node-only built-ins in runtime paths; secrets via `astro:env/server`; new secrets in `env.schema`            | Security and safety, partial idiomaticity |

**Gaps in MVP scoring** (agent may mention in summary but does not score):

- **Complexity** — defer to follow-up; needs eval fixtures before becoming a scored field
- **Documentation** — defer to follow-up; same reason

**Hard-fail rule:** any hard-fail trigger in the agent prompt → score ≤ 4 for that criterion; any criterion < 5 → verdict `fail`.

## Rollout phases

| Phase              | Scope                                                                                                     | Status   |
| ------------------ | --------------------------------------------------------------------------------------------------------- | -------- |
| 1 — Ship MVP       | Workflow + composite action; diff-only input; 5 criteria; PR comment; job gate on fail                    | Complete |
| 2 — Labels + retry | `ai-cr:passed` / `ai-cr:failed` labels; re-run on `ai-cr:review` label (`pull_request` `labeled` trigger) | Complete |
| 3 — PR title       | Wire title into agent prompt                                                                              | Planned  |
| 4 — Docs           | AGENTS.md CI section; branch protection check name `"AI Code Review / review"`                            | Planned  |

**Out of scope for this change:** PR description input, scored complexity/documentation fields, eval CI tier, fork PR reviews (forks skipped — secrets unavailable).

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary and five-criterion score table — **implemented**
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green) — **implemented**

## Expected behavior

- automatic run on every PR to `main` (same-repo only; fork PRs skipped) — **implemented**
- on-demand retry when label `ai-cr:review` is added — **implemented**
- job fails (merge gate) when verdict is `fail` — **implemented**; configure required check `"AI Code Review / review"` in branch protection after first successful soak run

### Label setup (manual — create before Phase 2)

Create in GitHub → Issues → Labels:

| Label          | Suggested color   | Purpose                      |
| -------------- | ----------------- | ---------------------------- |
| `ai-cr:passed` | `#0e8a16` (green) | Last automated review passed |
| `ai-cr:failed` | `#d73a4a` (red)   | Last automated review failed |
| `ai-cr:review` | `#0366d6` (blue)  | Trigger on-demand re-run     |

### Checkout depth (critical)

Workflow must use `fetch-depth: 0` on `actions/checkout`. Default shallow checkout causes empty `git diff` on the runner and the agent receives nothing to review.
