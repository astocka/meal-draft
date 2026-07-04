---
change_id: ci-cd-code-review
title: Introduce CI/CD workflow for PR code reviews
status: archived
created: 2026-06-22
updated: 2026-07-05
archived_at: 2026-07-04T22:48:09Z
---

## Notes

introducing first ci/cd workflow for pr code reviews

**Progress:** Phases 1–4 merged to `main`. Impl-review hardening merged. 4.3 branch protection: GitHub Ruleset created but disabled/non-enforcing — required check `AI Code Review / review (pull_request)` stays yellow ("Waiting for status to be reported") due to GitHub Rulesets bug with GitHub Actions checks. Classic branch protection also not possible — search does not surface the check until the workflow runs on a future PR to `main`. To complete 4.3: open next PR, wait for AI Code Review to run, then add classic branch protection rule.

### Outcome

Same-repo PRs to `main` receive automated AI code review: PR comment with five stack-specific scores, pass/fail labels, on-demand retry via `ai-cr:review`, and optional merge gate via **AI Code Review / review** status check.

### Prerequisites

- `OPENROUTER_API_KEY` GitHub Actions secret
- Manual labels: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`
- `packages/code-reviewer` package (from `tool-loop-agent` / `code-review-evals` changes)
- **Before course verification:** make repo public (if required), then enable branch protection on `main` requiring **AI Code Review / review** (plan 4.3)

### PRD refs

None — course/requirements-driven change (`requirements.md`).
