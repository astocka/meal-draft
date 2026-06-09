---
change_id: client-session-ci-gates
title: Client session and CI gates from phased test rollout
status: implemented
created: 2026-06-07
updated: 2026-06-10
archived_at: null
---

## Notes

Test-plan §3 Phase 4 from @context/foundation/test-plan.md.

### Outcome

Tiered CI enforces Vitest (including RLS integration on same-repo PRs), Playwright E2E on workerd preview (Risk #3 + #5), and updated test-plan/AGENTS docs — without production MealGenerator race fixes in this change.

### Prerequisites

- Phase 1 (data-isolation) implemented — Vitest bootstrap, RLS suite, `.env.test` pattern
- Hosted Supabase CI/test project with migrations applied and dedicated test users A/B
- GitHub repository secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` (build secrets already present)

### PRD refs

- NFR (quality / reliability); test-plan interview Q1, Q3 (Try another race, workerd concern); cross-cutting quality gates §5

### Shipped

2026-06-10 — all CI tiers verified on same-repo PR; impl-review F1–F7 closed; `change.md` epilogue complete.
