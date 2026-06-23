---
change_id: ci-cd-code-review
title: Introduce CI/CD workflow for PR code reviews
status: impl_reviewed
created: 2026-06-22
updated: 2026-06-23
archived_at: null
---

## Notes

introducing first ci/cd workflow for pr code reviews

**Progress:** Phases 1–3 complete. **Phase 4 in progress** — 4.1–4.2 done; 4.3 (branch protection) after merge to `main`; 4.4 pending. Impl-review triage fixes applied (uncommitted).

### Outcome

Same-repo PRs to `main` receive automated AI code review: PR comment with five stack-specific scores, pass/fail labels, on-demand retry via `ai-cr:review`, and optional merge gate via **AI Code Review / review** status check.

### Prerequisites

- `OPENROUTER_API_KEY` GitHub Actions secret
- Manual labels: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`
- `packages/code-reviewer` package (from `tool-loop-agent` / `code-review-evals` changes)

### PRD refs

None — course/requirements-driven change (`requirements.md`).
