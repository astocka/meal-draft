# Domain Data Schema Implementation Plan

## Overview

Create the three Supabase domain tables (pantry, favorites, generation history) with per-user row-level security, a history retention trigger (N=20), and matching TypeScript entity types. This is foundation slice F-01 — no API routes or UI in this change.

## Current State Analysis

- Supabase SSR client exists at `src/lib/supabase.ts` — auth only; no `.from()` database queries anywhere.
- `supabase/config.toml` is present; `supabase/migrations/` does not exist; no `.sql` files in the repo.
- `src/types.ts` does not exist (documented in AGENTS.md but never created).
- Auth middleware resolves `context.locals.user` via `supabase.auth.getUser()` (`src/middleware.ts`).
- PRD requires pantry (name-only v1), favorites (full recipe snapshot), and generation history (name, date, meal type; capped to last N).

## Desired End State

After this plan completes:

1. A single migration in `supabase/migrations/` creates `pantry_products`, `favorite_meals`, and `generation_history` with RLS enabled on all three.
2. Each table enforces account-private data via granular RLS policies scoped to `(select auth.uid()) = user_id`, with explicit `GRANT`s to `authenticated` per table.
3. `generation_history` automatically prunes to the last 20 rows per user on insert.
4. `src/types.ts` exports TypeScript types aligned with the schema for downstream slices (S-02, S-05, S-06).
5. `npx supabase db push` applies the migration to the linked hosted Supabase project without errors.

### Key Discoveries:

- Greenfield database layer — first migration sets the convention for all future schema work (`AGENTS.md`: `YYYYMMDDHHmmss_short_description.sql`).
- `supabase/config.toml` references `./seed.sql` but the file does not exist — add an empty seed file for repo hygiene (optional for cloud-only `db push`).
- History is read-only in the UI (US-04) — RLS should allow SELECT + INSERT only, not UPDATE/DELETE.
- Favorites need full recipe JSON (US-03); history list UI needs only name/date/meal_type but stores an optional recipe blob for future detail views.

## What We're NOT Doing

- Pantry CRUD API or UI (S-02)
- Favorites save/list UI (S-05)
- Generation history browse UI (S-06)
- AI meal generation integration (F-02)
- Persisting user constraint preferences (time budget / meal type defaults)
- Local Supabase via Docker (use hosted Supabase + `db push` instead)
- npm wrapper scripts for Supabase CLI
- Generated Supabase TypeScript types (`supabase gen types`) — hand-written types in `src/types.ts` for now

## Implementation Approach

One atomic migration file creates enums, tables, indexes, RLS policies, and the history prune trigger. Follow Supabase/Postgres conventions: `uuid` primary keys, `timestamptz` timestamps, `ON DELETE CASCADE` from `auth.users`, and granular per-operation RLS policies per AGENTS.md.

TypeScript types mirror the schema with a shared `MealRecipe` JSON shape used by both favorites and history.

## Critical Implementation Details

**Seed file:** Add empty `supabase/seed.sql` (comment-only) so the repo matches `config.toml` — not required for cloud `db push`, but keeps the migration folder complete for future local use.

**History prune trigger:** Implement as an `AFTER INSERT` trigger on `generation_history` that deletes older rows beyond N=20 for `NEW.user_id`. Use a subquery ordered by `generated_at DESC` — not a hardcoded row count on the table globally. The trigger function **must** be `SECURITY DEFINER` with `SET search_path = pg_catalog` and owned by `postgres` — without this, RLS blocks the trigger's DELETE (no user DELETE policy) and the 21st insert rolls back.

**Verification UI:** Use the hosted **Supabase Dashboard (Studio)** in the browser — Table Editor, SQL Editor, Authentication → Policies. There is no Supabase desktop app; Studio is the same web admin UI whether self-hosted (Docker) or cloud. The Dashboard SQL Editor runs as **postgres/admin** and **bypasses RLS** — use it for schema, constraints, and triggers; use **authenticated role simulation** (see Testing Strategy) for RLS checks.

## Phase 1: Domain Schema Migration

### Overview

Create `supabase/migrations/20260528120000_domain_data_schema.sql` with all tables, constraints, RLS policies, and the history prune trigger.

### Changes Required:

#### 1. Meal type enum

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Define the meal type constraint values locked by FR-008 (breakfast, lunch, dinner) as a Postgres enum reused by `generation_history`.

**Contract**: `CREATE TYPE public.meal_type AS ENUM ('breakfast', 'lunch', 'dinner');`

#### 2. Pantry products table

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Store each user's virtual pantry as name-only product rows (FR-003–006). Enforce one row per normalized name per user.

**Contract**: Table `public.pantry_products` with columns `id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. Unique index on `(user_id, lower(trim(name)))`. Index on `user_id`. `BEFORE UPDATE` trigger sets `updated_at = now()` on every row update.

#### 3. Favorite meals table

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Persist full recipe snapshots when users save generated meals (US-03). Prevent duplicate favorites per user by dish name.

**Contract**: Table `public.favorite_meals` with columns `id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `recipe jsonb NOT NULL`, `saved_at timestamptz NOT NULL DEFAULT now()`. Unique index on `(user_id, lower(trim(recipe->>'name')))`. Index on `user_id`. Recipe JSON must contain keys: `name`, `prep_time_minutes`, `ingredients` (array), `steps` (array).

#### 4. Generation history table

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Log generated meals for read-only browsing (US-04, FR-013). Store list-display fields denormalized plus optional full recipe blob.

**Contract**: Table `public.generation_history` with columns `id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL`, `meal_type public.meal_type NOT NULL`, `generated_at timestamptz NOT NULL DEFAULT now()`, `recipe jsonb` (nullable). Index on `(user_id, generated_at DESC)`.

#### 5. History prune trigger

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Enforce last-N retention (N=20 default) at the database layer so storage stays bounded regardless of which slice inserts rows.

**Contract**: Function `public.prune_generation_history()` triggered `AFTER INSERT` on `generation_history` — deletes rows for `NEW.user_id` where `id` is not among the 20 most recent by `generated_at`. Constant N=20; document as assumption until PRD Open Question #1 is resolved. Function must be `SECURITY DEFINER`, owned by `postgres`, with `SET search_path = pg_catalog`; scope all deletes to `NEW.user_id` only. Do **not** add a user-facing DELETE RLS policy — the definer privilege is what allows pruning while keeping history read-only for clients.

#### 6. Row-level security policies

**File**: `supabase/migrations/20260528120000_domain_data_schema.sql`

**Intent**: Enforce account-private data per PRD Access Control and AGENTS.md (granular per-operation policies).

**Contract**:
- All three tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- `pantry_products`: SELECT, INSERT, UPDATE, DELETE policies — `(select auth.uid()) = user_id` (see syntax below)
- `favorite_meals`: SELECT, INSERT, DELETE policies — `(select auth.uid()) = user_id` (no UPDATE in v1)
- `generation_history`: SELECT, INSERT policies only — `(select auth.uid()) = user_id` (read-only log; no UPDATE/DELETE)
- **Policy syntax:** scope all policies `TO authenticated`. SELECT/DELETE use `USING ((select auth.uid()) = user_id)`. INSERT uses `WITH CHECK ((select auth.uid()) = user_id)`. UPDATE on `pantry_products` uses both `USING` and `WITH CHECK`.
- **Table grants:** `GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_products TO authenticated`; `GRANT SELECT, INSERT, DELETE ON favorite_meals TO authenticated`; `GRANT SELECT, INSERT ON generation_history TO authenticated`. No grants on domain tables to `anon`.

#### 7. Seed config fix

**File**: `supabase/seed.sql` (new) **or** `supabase/config.toml`

**Intent**: Add empty seed file for repo/config alignment (optional for cloud workflow).

**Contract**: Add `supabase/seed.sql` with a no-op comment.

### Success Criteria:

#### Automated Verification:

- Project linked: `npx supabase link` (one-time; requires `npx supabase login`)
- Migration applies cleanly: `npx supabase db push`
- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification:

**Schema** (Supabase Dashboard → SQL Editor or Table Editor — admin role; RLS bypassed):

- Table Editor shows `pantry_products`, `favorite_meals`, and `generation_history` after `db push`
- Duplicate pantry name for same user (case-variant) — rejected by unique index
- Insert 21 history rows for one user — only 20 remain after each insert beyond cap
- Insert favorite with same recipe name twice for same user — rejected by unique index

**RLS** (requires `authenticated` role simulation — admin SQL Editor does not enforce RLS):

- Per-operation policies exist on all three tables (Dashboard → Authentication → Policies)
- User A can INSERT/SELECT own rows; User B cannot SELECT User A's rows (JWT claim simulation — see Testing Strategy)
- `generation_history` UPDATE/DELETE denied for `authenticated` role

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: TypeScript Domain Types

### Overview

Create `src/types.ts` with entity types and the shared recipe JSON shape matching the migration.

### Changes Required:

#### 1. Shared types file

**File**: `src/types.ts`

**Intent**: Provide a single source of truth for domain entity shapes referenced by downstream API routes and services (S-02, S-05, S-06).

**Contract**: Export at minimum:
- `MealType` — union `'breakfast' | 'lunch' | 'dinner'`
- `MealRecipe` — `{ name: string; prep_time_minutes: number; ingredients: string[]; steps: string[] }`
- `PantryProduct` — `{ id: string; user_id: string; name: string; created_at: string; updated_at: string }`
- `FavoriteMeal` — `{ id: string; user_id: string; recipe: MealRecipe; saved_at: string }`
- `GenerationHistoryEntry` — `{ id: string; user_id: string; name: string; meal_type: MealType; generated_at: string; recipe: MealRecipe | null }`

Use `string` for UUID and timestamp fields (ISO 8601 from Supabase JSON responses).

### Success Criteria:

#### Automated Verification:

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification:

- Types align with columns created in Phase 1 (spot-check in Supabase Dashboard → Table Editor)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No test suite configured in this repo (AGENTS.md). Schema correctness is verified via migration apply + manual checks in Supabase Dashboard (Studio).

### Integration Tests:

Deferred to downstream slices when API routes exist. Full end-to-end RLS via the app ships with S-02 (first `.from()` calls).

### Manual Testing Steps

#### 1. Apply migration

1. `npx supabase login`, `npx supabase link`, then `npx supabase db push`
2. Confirm three tables in **Dashboard (Studio) → Table Editor**

#### 2. Schema checks (SQL Editor — admin role)

Run as postgres in **Dashboard → SQL Editor** (RLS not enforced):

3. Insert duplicate pantry names `"Flour"` / `"flour"` for the same `user_id` — second insert fails
4. Insert 21 `generation_history` rows for one `user_id` — count stays at 20
5. Insert two favorites with the same `recipe->>'name'` for one user — second insert fails

#### 3. RLS checks (simulate authenticated role)

Dashboard SQL Editor bypasses RLS when connected as admin. To test policies, create two auth users (**Dashboard → Authentication** or app sign-up), then in SQL Editor run:

```sql
-- User A: insert own pantry row
select set_config('request.jwt.claims', '{"sub":"<user-a-uuid>","role":"authenticated"}', true);
set role authenticated;
insert into pantry_products (user_id, name) values ('<user-a-uuid>', 'rls-test');
select * from pantry_products;  -- sees own row

-- User B: cannot see User A's row
select set_config('request.jwt.claims', '{"sub":"<user-b-uuid>","role":"authenticated"}', true);
set role authenticated;
select * from pantry_products;  -- empty (or only B's rows)

-- User A: history is read-only (UPDATE/DELETE denied)
select set_config('request.jwt.claims', '{"sub":"<user-a-uuid>","role":"authenticated"}', true);
set role authenticated;
update generation_history set name = 'x' where user_id = '<user-a-uuid>';  -- denied
delete from generation_history where user_id = '<user-a-uuid>';             -- denied
reset role;
```

Replace `<user-a-uuid>` / `<user-b-uuid>` with IDs from **Authentication → Users**.

#### 4. Policy review

6. **Dashboard → Authentication → Policies** — confirm SELECT/INSERT/UPDATE/DELETE (as applicable) policies on all three tables, scoped `TO authenticated`

## Performance Considerations

- History prune trigger runs on every insert — acceptable at v1 generation frequency; index on `(user_id, generated_at DESC)` keeps delete subquery fast.
- JSONB recipe storage avoids join overhead for favorites display in S-05.
- `max_rows = 1000` in `supabase/config.toml` is sufficient for pantry/favorites list queries.

## Migration Notes

- This is the **first** migration — no backfill or rollback of prior schema.
- Apply to hosted project: `npx supabase login` → `npx supabase link` → `npx supabase db push` after local review of the SQL.
- N=20 is a documented default assumption; changing it later requires a new migration to update the trigger function constant.

## References

- Change identity: `context/changes/domain-data-schema/change.md`
- PRD: `context/foundation/prd.md` — US-02, US-03, US-04, FR-003–006, FR-011–013, Access Control
- Roadmap F-01: `context/foundation/roadmap.md`
- Supabase client: `src/lib/supabase.ts`
- Plan review: `context/changes/domain-data-schema/reviews/plan-review.md`
- AGENTS.md — RLS and migration naming conventions

## Addendum: History Prune Tie-Breaking (discovered during implementation)

**Migration**: `supabase/migrations/20260528140000_fix_history_prune_ordering.sql` — applied in commit 896dce6 alongside Phase 1.

**Problem discovered**: When multiple `generation_history` rows for the same user share the same `generated_at` timestamp (e.g. bulk inserts in tests), PostgreSQL's `ORDER BY generated_at DESC LIMIT 20` sub-select is non-deterministic — it may keep an arbitrary 20 rows and delete the wrong one, violating the "last N" guarantee.

**Fix applied**:
- Added `seq bigint GENERATED ALWAYS AS IDENTITY` to `generation_history` as an insert-order tie-breaker.
- Replaced the old `(user_id, generated_at DESC)` index with `(user_id, generated_at DESC, seq DESC)`.
- Rewrote `prune_generation_history()` to `ORDER BY generated_at DESC, seq DESC LIMIT 20`.
- `seq` was also added to `GenerationHistoryEntry` in `src/types.ts` as `seq: number`.

**Scope note**: The `seq` column is an internal implementation detail, not a domain property. Downstream slices should treat it as opaque; see F3 in the impl-review for the follow-up decision on whether to hide it from the TS type.

**Also discovered**: A `favorite_meals_recipe_shape_check` CHECK constraint was added to `favorite_meals` to validate recipe JSON structure at the DB layer (key presence + array types for `ingredients`/`steps`). This was not in the original plan but is additive and consistent with the PRD intent.

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Domain Schema Migration

#### Automated

- [x] 1.1 Project linked: `npx supabase link` — 896dce6
- [x] 1.2 Migration applies cleanly: `npx supabase db push` — 896dce6
- [x] 1.3 Linting passes: `pnpm run lint` — 896dce6
- [x] 1.4 Production build passes: `pnpm run build` — 896dce6

#### Manual

- [x] 1.5 Table Editor shows all three domain tables — 896dce6
- [x] 1.6 Pantry duplicate name rejected (case-insensitive) — 896dce6
- [x] 1.7 History prunes to 20 rows per user — 896dce6
- [x] 1.8 Favorite duplicate dish name rejected — 896dce6
- [x] 1.9 RLS policies present on all three tables — 896dce6
- [x] 1.10 RLS isolation verified (authenticated role simulation, two users) — 896dce6
- [x] 1.11 History UPDATE/DELETE denied for authenticated role — 896dce6

### Phase 2: TypeScript Domain Types

#### Automated

- [x] 2.1 Linting passes: `pnpm run lint` — 77e7ed6
- [x] 2.2 Production build passes: `pnpm run build` — 77e7ed6

#### Manual

- [x] 2.3 Types align with migration columns (spot-check) — 77e7ed6
