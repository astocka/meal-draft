---
change_id: domain-data-schema
title: Add pantry, favorites, and history schema with RLS
status: archived
created: 2026-05-28
updated: 2026-07-02
archived_at: 2026-07-02T17:11:26Z
---

## Notes

Roadmap foundation F-01 from @context/foundation/roadmap.md.

Plan reviewed — verdict SOUND. See `reviews/plan-review.md`. Schema applies to hosted Supabase via `npx supabase link` + `npx supabase db push`.

### Outcome

(foundation) Pantry, favorites, and generation-history tables exist with per-user row-level security enforcing account-private data.

### Prerequisites

None

### PRD refs

Access Control, NFR (pantry/favorites/history private to account)
