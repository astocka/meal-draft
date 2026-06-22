# CI/CD Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`
> Requirements: `context/changes/ci-cd-code-review/requirements.md`

## What & Why

Automate AI code review on every same-repo PR to `main`: pipe the git diff to the existing `packages/code-reviewer` agent, post a structured PR comment with scores, apply pass/fail labels, and fail the CI job when the agent returns `verdict: fail`. Reduces manual review load while enforcing MealDraft stack conventions (Astro islands, Tailwind `cn()`, Supabase RLS, tests, worker compatibility).

## Starting Point

Phase 1 workflow and composite action are committed on `feat/ci-cd-code-review`. The agent package is modular, eval-validated (haiku default), and scores five stack-specific criteria. Research confirmed gaps: labels, on-demand retry, PR title, docs, and `ci.yml` SHA-pinning.

## Desired End State

Same-repo PRs to `main` get automatic AI review with upserted comment, `ai-cr:passed`/`ai-cr:failed` labels, and on-demand re-run via `ai-cr:review`. Agent receives diff + PR title. After a successful soak run, **AI Code Review / review** becomes a required branch protection check. `AGENTS.md` documents the tier; all remote GHA actions SHA-pinned.

## Key Decisions Made

| Decision           | Choice                              | Why                                                     | Source   |
| ------------------ | ----------------------------------- | ------------------------------------------------------- | -------- |
| Criteria model     | Keep 5 stack-specific               | Eval-validated; hard-fail rules catch real violations   | Research |
| PR metadata        | Diff only MVP; title Phase 3        | Cost control; evals test diff-only path                 | Research |
| Labels + retry     | `labeled` trigger on `ai-cr:review` | Matches requirements UX                                 | Research |
| Fork PRs           | Skip                                | Secrets unavailable; avoids `pull_request_target` risk  | Research |
| Label provisioning | Manual in GitHub UI                 | Simpler; no extra permissions for label creation        | Plan     |
| Merge gate         | Advisory first, required after soak | Safe rollout before blocking merges                     | Plan     |
| Checkout depth     | `fetch-depth: 0`                    | Shallow checkout yields empty diff — agent gets nothing | Plan     |
| SHA-pinning        | All remote actions @ `<sha>`        | 2026 Zero Trust; tags can move without notice           | Plan     |
| Plan scope         | All 4 phases in one plan            | Matches requirements rollout table                      | Plan     |

## Scope

**In scope:** MVP verification, labels + retry, PR title input, AGENTS.md docs, branch protection notes, `ci.yml` SHA-pinning, manual label/secret setup docs

**Out of scope:** PR description, six generic criteria migration, complexity/documentation scored fields, eval CI tier, fork PR reviews, external published composite action

## Architecture / Approach

```
pull_request → review.yml (SHA-pinned remote actions, fetch-depth: 0)
  → pnpm install
  → ./.github/actions/ai-reviewer (local composite — diff [+ title Phase 3])
  → packages/code-reviewer (OpenRouter, AGENTS.md, 5 criteria)
  → github-script: upsert comment + apply labels
  → exit 1 on fail
```

## Phases at a Glance

| Phase             | What it delivers                                | Key risk                                   |
| ----------------- | ----------------------------------------------- | ------------------------------------------ |
| 1. Ship MVP       | Secret, merge, live PR verification, label docs | Empty diff if `fetch-depth` removed        |
| 2. Labels + retry | `ai-cr:*` labels; `ai-cr:review` re-run         | Label loop / permissions (`issues: write`) |
| 3. PR title       | Title in prompt via env                         | Prompt drift vs eval fixtures              |
| 4. Docs + SHA pin | AGENTS.md, branch protection, `ci.yml` pins     | CI breakage if wrong action SHAs           |

**Prerequisites:** `OPENROUTER_API_KEY` in GitHub secrets; three labels created manually; `feat/ci-cd-code-review` merged

**Estimated effort:** ~2–3 sessions across 4 phases

## Open Risks & Assumptions

- OpenRouter API cost scales with diff size — no truncation in MVP
- Branch protection is manual GitHub UI configuration
- First run requires secret + labels before Phase 2 code applies labels

## Success Criteria (Summary)

- Test PR receives AI review comment with five scores and correct pass/fail job outcome
- `ai-cr:review` label triggers re-run; pass/fail labels update
- After soak, **AI Code Review / review** blocks merge on fail verdict
- `AGENTS.md` and `ci.yml` reflect SHA-pinning and AI review tier
