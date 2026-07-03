# Domain Data Schema — Plan Brief

> Full plan: `context/changes/domain-data-schema/plan.md`
> Plan review: `context/changes/domain-data-schema/reviews/plan-review.md` (verdict: SOUND)

## What & Why

MealDraft needs persisted, account-private user data before any feature slice can ship. F-01 creates the pantry, favorites, and generation history tables with row-level security — the foundation every vertical slice (S-02, S-05, S-06) depends on.

## Starting Point

Supabase Auth is wired (`src/lib/supabase.ts`, middleware, sign-in/up/out routes) but the database has zero migrations, no domain tables, and no `src/types.ts`. All `.from()` queries are greenfield.

## Desired End State

Three RLS-protected tables exist on the hosted Supabase project and match TypeScript types in `src/types.ts`. A logged-in user's pantry, favorites, and history are invisible to other users. Generation history auto-retains only the last 20 entries per user via a `SECURITY DEFINER` prune trigger.

## Key Decisions Made

| Decision                | Choice                                          | Why (1 sentence)                                                                                      | Source    |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| Deliverables            | Schema + RLS + `src/types.ts`                   | Gives downstream slices a typed contract without waiting for API work                                 | Plan      |
| Pantry uniqueness       | Unique name per user (case-insensitive)         | Prevents duplicate "flour" rows in a name-only v1 model                                               | Plan      |
| Favorites storage       | JSONB recipe snapshot                           | Matches F-02 structured output; sufficient for read-only favorites list                               | Plan      |
| History fields          | name + date + meal_type + optional recipe blob  | US-04 minimum for list UI; blob enables future detail without re-generation                           | Plan      |
| History cap             | Prune on insert, N=20                           | Bounded storage; matches "last N not displayed" intent                                                | Plan      |
| Favorite dedup          | Unique per user on dish name                    | Idempotent save; matches US-03 duplicate prevention                                                   | Plan      |
| Migration packaging     | Single atomic migration file                    | First migration — one review unit, clean apply/rollback                                               | Plan      |
| Prune trigger privilege | `SECURITY DEFINER` + `search_path = pg_catalog` | RLS blocks user DELETE; definer privilege prunes without exposing DELETE to clients                   | Review F1 |
| Table access            | Explicit `GRANT`s to `authenticated`            | RLS alone does not grant table access; avoids hosted-project permission errors                        | Review F2 |
| RLS policy syntax       | `TO authenticated`; USING / WITH CHECK          | Prevents `user_id` spoofing on INSERT/UPDATE                                                          | Review F3 |
| Pantry `updated_at`     | `BEFORE UPDATE` trigger                         | Keeps metadata correct without burdening S-02 API                                                     | Review F5 |
| Database environment    | Hosted Supabase (cloud)                         | Apply migrations with CLI; verify in Supabase Dashboard (Studio)                                      | Plan      |
| Verification UI         | Dashboard (Studio) in browser                   | No desktop app; SQL Editor runs as admin (bypasses RLS) — simulate `authenticated` role for RLS tests | Plan      |

## Scope

**In scope:** One SQL migration (enum, tables, indexes, RLS with USING/WITH CHECK, explicit GRANTs, history prune trigger, pantry `updated_at` trigger); empty `supabase/seed.sql` (repo hygiene); `npx supabase link` + `npx supabase db push`; `src/types.ts` entity types.

**Out of scope:** API routes, UI, AI generation (F-02), generated Supabase types, constraint preferences table, local Supabase via Docker.

## Architecture / Approach

```
auth.users
    ├── pantry_products     (CRUD RLS + updated_at trigger)
    ├── favorite_meals      (SELECT/INSERT/DELETE RLS, JSONB recipe)
    └── generation_history  (SELECT/INSERT RLS, SECURITY DEFINER prune → keep 20)
```

All tables use `user_id` FK with `ON DELETE CASCADE`. Policies scope every operation to `(select auth.uid()) = user_id` with granular per-operation syntax. Explicit `GRANT`s to `authenticated` match allowed operations per table.

## Phases at a Glance

| Phase                      | What it delivers                              | Key risk                                                                 |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Domain schema migration | Tables, RLS, GRANTs, both triggers, seed file | `db push` applies to linked hosted project — confirm project before push |
| 2. TypeScript domain types | `src/types.ts` aligned with schema            | Minor drift if columns change before S-02                                |

**Prerequisites:** Supabase cloud project; `npx supabase login` + `npx supabase link`; cloud `SUPABASE_URL` + anon key in `.env` and `.dev.vars`.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- N=20 is an assumption until PRD Open Question #1 is resolved — changing it requires a follow-up migration.
- Favorite dedup by dish name may block legitimately different recipes with the same title — acceptable for v1.
- No automated RLS tests; F-01 uses manual checks in Supabase Dashboard (Studio).
- Dashboard SQL Editor runs as admin and bypasses RLS — RLS isolation requires JWT claim simulation or waits until S-02 app `.from()` calls.
- Migrations apply directly to the linked hosted database (no local Docker stack).

## Success Criteria (Summary)

**Schema** (SQL Editor / Table Editor):

- `npx supabase db push` applies the migration without errors
- Unique indexes and prune trigger behave as specified
- History never exceeds 20 rows per user after inserts (21st insert succeeds, oldest row pruned)

**RLS** (authenticated role simulation in SQL Editor, or deferred to S-02):

- Policies exist on all three tables
- Two users cannot read each other's pantry, favorites, or history rows
- Authenticated users cannot UPDATE/DELETE `generation_history`
