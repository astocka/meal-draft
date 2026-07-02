---
change_id: ci-cd-code-review
title: Introduce CI/CD workflow for PR code reviews
status: archived
created: 2026-06-22
updated: 2026-07-02
archived_at: 2026-07-02T17:11:26Z
---

## Notes

introducing first ci/cd workflow for pr code reviews

**Progress:** Phases 1–4 partial close-out on `main` (PR #28). Impl-review hardening merged. **Pending:** 4.3 branch protection when repo is public (before course verification).

### Outcome

Same-repo PRs to `main` receive automated AI code review: PR comment with five stack-specific scores, pass/fail labels, on-demand retry via `ai-cr:review`, and optional merge gate via **AI Code Review / review** status check.

### Prerequisites

- `OPENROUTER_API_KEY` GitHub Actions secret
- Manual labels: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`
- `packages/code-reviewer` package (from `tool-loop-agent` / `code-review-evals` changes)
- **Before course verification:** make repo public (if required), then enable branch protection on `main` requiring **AI Code Review / review** (plan 4.3)

### PRD refs

None — course/requirements-driven change (`requirements.md`).
