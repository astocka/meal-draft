---
change_id: data-isolation
title: Test rollout Phase 1 — data isolation (RLS cross-user denial)
status: implementing
created: 2026-06-06
updated: 2026-06-06
archived_at: null
---

## Notes

Test rollout Phase 1 from @context/foundation/test-plan.md.

### Outcome

Test runner bootstrap plus automated Tier A RLS cross-user denial tests on `pantry_products`, `favorite_meals`, and `generation_history`; server env guard rejects service-role `SUPABASE_KEY`.

### Prerequisites

- F-01 domain schema applied (RLS policies live)
- Local test env only: `.env.test` with Supabase URL + anon key (your dev/local project — not CI)
- No prior test runner required (greenfield bootstrap)

### PRD refs

- PRD Access Control (account-private data)
- PRD NFR privacy
- Test-plan Risks #1, #6 (DB layer)
