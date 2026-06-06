---
date: 2026-06-06T00:00:00+02:00
researcher: Auto
git_commit: 362a392d5a849d4ce2684c53e9ecd022df880792
branch: test/data-isolation
repository: meal-draft
topic: "Test rollout Phase 1 — data isolation (RLS cross-user denial, Risk #1 and #6)"
tags: [research, codebase, rls, supabase, idor, data-isolation, vitest]
status: complete
last_updated: 2026-06-06
last_updated_by: Auto
last_updated_note: "Decisions locked — Tier A exit, local-only (.env.test, no Docker/CI), env guard yes"
---

# Research: Data isolation (RLS cross-user denial)

**Date**: 2026-06-06
**Researcher**: Auto
**Git Commit**: `362a392d5a849d4ce2684c53e9ecd022df880792`
**Branch**: `test/data-isolation`
**Repository**: meal-draft

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` for the `data-isolation` change:

- **Risk #1**: User A views or modifies User B's pantry, favorites, or generation history (RLS or policy gap).
- **Risk #6**: Authenticated user accesses another user's resource by ID (IDOR — session present but ownership not verified).

Verify or correct test-plan response guidance; locate failure paths, existing tests, and the cheapest useful test layer.

## Summary

MealDraft's data isolation is **defense-in-depth**: RLS on all three domain tables (`pantry_products`, `favorite_meals`, `generation_history`) scoped to `(select auth.uid()) = user_id`, plus explicit `.eq("user_id", user.id)` (or insert `user_id`) in every app query path. There is **no service-role client** in application code — all server DB access uses cookie-bound SSR clients with the anon key.

**RLS is complete and consistent** for client-facing operations. Cross-user denial at the database layer should be proven with **two authenticated JWT sessions** against a Supabase project configured in `.env.test` (URL + anon key), not via SQL Editor (admin bypasses RLS).

**Risk #6 response guidance corrected** (backported to `test-plan.md` §2): DELETE routes return **`204` even when zero rows match**; no route returns `403`. PATCH pantry returns `404` for foreign/missing IDs. Tests assert **no data mutation and no row leakage**, and for DELETE verify **row persistence**, not HTTP status alone.

**Cheapest test layer (verified)**: Vitest + `@supabase/supabase-js` against the Supabase project in `.env.test` with two test users — **Tier A RLS policy tests** are sufficient for Phase 1 exit (see Decisions). Tier B HTTP integration deferred to test-plan Phase 2 (API contracts). Bootstrap Vitest in this phase per test-plan §3 Phase 1.

**No existing automated tests** — F-01 deferred RLS verification to manual Studio JWT simulation; S-02/S-05 added defense-in-depth filters but no cross-user test suite.

## Detailed Findings

### Database layer — RLS policies

All RLS lives in [`supabase/migrations/20260528120000_domain_data_schema.sql`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/supabase/migrations/20260528120000_domain_data_schema.sql).

| Table | Owner column | RLS enabled | Client policies | Client grants |
|-------|--------------|-------------|-----------------|---------------|
| `pantry_products` | `user_id` → `auth.users` | yes (L110) | SELECT, INSERT, UPDATE, DELETE | full CRUD |
| `favorite_meals` | `user_id` | yes (L111) | SELECT, INSERT, DELETE (no UPDATE — v1) | SELECT, INSERT, DELETE |
| `generation_history` | `user_id` | yes (L112) | SELECT, INSERT only | SELECT, INSERT |

Every policy uses `(select auth.uid()) = user_id` in `USING` and/or `WITH CHECK` (L114–167). INSERT policies use `WITH CHECK` only; UPDATE on pantry uses both `USING` and `WITH CHECK` (anti-`user_id` reassignment).

**Intentional bypass — history prune trigger:**

[`prune_generation_history()`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/supabase/migrations/20260528120000_domain_data_schema.sql#L78-L97) is `SECURITY DEFINER` and deletes rows bypassing RLS, scoped to `gh.user_id = NEW.user_id` only. Cross-user prune is not possible via normal insert path because `NEW` must pass `generation_history_insert_own` `WITH CHECK`.

**Operational risks (not app bugs):**

- No `FORCE ROW LEVEL SECURITY` — table owner / `postgres` bypasses RLS (Studio, migrations).
- Supabase `service_role` JWT bypasses RLS platform-wide — **must confirm `SUPABASE_KEY` is anon key** in all environments or RLS tests are meaningless.

### Application layer — Supabase client

Single factory in [`src/lib/supabase.ts`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/lib/supabase.ts#L5-L27): `createServerClient` with cookie session. No service-role factory anywhere.

Auth resolved once in [`src/middleware.ts`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/middleware.ts#L10-L24) via `getUser()` → `context.locals.user`. Data API routes check `if (!user) return 401` and do not re-call `getUser()`.

### Application layer — API routes and IDOR surface

| Endpoint | Table(s) | Ownership layer |
|----------|----------|-----------------|
| `GET/POST /api/pantry` | `pantry_products` | `.eq("user_id", user.id)` / insert `user_id` |
| `PATCH/DELETE /api/pantry/[id]` | `pantry_products` | `.eq("id", id).eq("user_id", user.id)` |
| `GET/POST /api/favorites` | `favorite_meals` | same pattern |
| `DELETE /api/favorites/[id]` | `favorite_meals` | `.eq("id", parsedId).eq("user_id", user.id)` + UUID validation |
| `POST /api/generate` | `pantry_products` (read), `generation_history` (write) | `generateMeal(userId, …)` filters/inserts by `userId` |

**No read API for `generation_history`** — IDOR by history UUID is not exposed; `history_id` in generate response has no `GET /api/.../[id]` consumer.

**IDOR semantics gaps (Risk #6):**

1. [`DELETE /api/pantry/[id]`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/pages/api/pantry/[id].ts#L73-L79) — returns `204` regardless of rows deleted (foreign ID indistinguishable from success).
2. [`DELETE /api/favorites/[id]`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/pages/api/favorites/[id].ts) — same `204` on zero rows.
3. [`PATCH /api/pantry/[id]`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/pages/api/pantry/[id].ts#L51-L52) — `404` on `PGRST116` (correct — no body leak).
4. **No `403` anywhere** — authenticated cross-user attempts get `404` (PATCH) or silent `204` (DELETE).
5. `pantry/[id]` lacks UUID validation (favorites validates); malformed IDs may surface as `500`.

SSR prefetch on [`dashboard.astro`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/pages/dashboard.astro) and [`favorites.astro`](https://github.com/astocka/meal-draft/blob/362a392d5a849d4ce2684c53e9ecd022df880792/src/pages/favorites.astro) uses `.eq("user_id", user.id)` under middleware page gate (`PROTECTED_ROUTES`: `/dashboard`, `/favorites` only — `/api/*` not redirect-gated).

### Test-plan response guidance — verification

| Risk | Planned response | Research verdict |
|------|------------------|------------------|
| #1 | Cross-user rows invisible/unmodifiable | **Confirmed** — test at RLS layer with two JWTs; cover all three tables × applicable ops |
| #1 | Challenge: "RLS enabled" ≠ works | **Valid** — F-01 used manual simulation only; no automated proof |
| #6 | No foreign row returned/mutated; PATCH 404; DELETE verify persistence | **Confirmed** — backported to test-plan §2; no 403 in app; DELETE is 204 on zero rows |
| #6 | Challenge: middleware auth ≠ ownership | **Valid** — ownership is explicit filter + RLS, not middleware |
| Cheapest layer | integration (Supabase via `.env.test`) | **Confirmed** — no test runner yet; Vitest bootstrap fits this phase |

### Recommended test matrix (for `/10x-plan`)

**Tier A — RLS policy tests (Risk #1, highest signal/cost):**

Run against the Supabase project in `.env.test` (migrations applied). Create User A and User B via Auth API or test helpers. Seed one row per table owned by User B. As User A's JWT client:

- SELECT each table → empty (no B rows).
- INSERT with `user_id = B` → denied (`WITH CHECK`).
- UPDATE/DELETE B's row by UUID → 0 rows affected.
- Pantry: UPDATE own row attempting `user_id` reassignment → denied.

**Tier B — HTTP integration (Risk #6, defense-in-depth):** **Deferred** to test-plan §3 Phase 2 (Bootstrap + API contracts). Not required for Phase 1 exit.

When implemented, assert:

- `PATCH /api/pantry/{B_id}` as A → `404`, B row unchanged.
- `DELETE /api/pantry/{B_id}` as A → `204` but B row still exists (verify DB state, not status alone).
- `GET /api/pantry` as A → never includes B's items.
- Unauthenticated → `401` on all data routes.

**Tier C — defer to Phase 2:** Zod envelope tests (Risk #4), middleware-only auth gate tests.

**Anti-patterns to avoid (from test-plan):**

- Happy-path-only "authenticated user can CRUD own data."
- Mocking Supabase so RLS never executes.
- Asserting DELETE `204` without verifying row still exists.
- Using service-role key in tests (bypasses the thing under test).

### Vitest bootstrap notes

- No Vitest in `package.json` today; `@supabase/supabase-js` already a dependency.
- **Test target:** Supabase URL + anon key from `.env.test` (dev/local project — no Docker, no CI).
- Layout (plan): `tests/integration/` — see `plan.md`.
- Policy tests can use `createClient(url, anonKey)` + `signInWithPassword` for two users without Astro runtime.
- **Phase 1 exit:** Tier A only — `pnpm test` runs locally with `.env.test` configured; **not wired in CI**.
- **Env guard (Phase 1):** Assert at server startup that `SUPABASE_KEY` is the anon key, not service-role (see Decisions #4).

## Code References

- `supabase/migrations/20260528120000_domain_data_schema.sql:9-175` — tables, RLS policies, grants
- `supabase/migrations/20260528140000_fix_history_prune_ordering.sql:10-28` — prune function update
- `src/lib/supabase.ts:5-27` — SSR cookie client factory
- `src/middleware.ts:6-7,34-38` — protected pages, not API
- `src/pages/api/pantry/index.ts` — list/create with `user_id` filter
- `src/pages/api/pantry/[id].ts:39-79` — PATCH 404 vs DELETE 204 behavior
- `src/pages/api/favorites/[id].ts` — DELETE with UUID validation
- `src/lib/generation.ts:103-106,170-175,235-244` — pantry read + history insert scoped by `userId`

## Architecture Insights

1. **RLS is primary; app filters are defense-in-depth** — documented in pantry-crud plan after impl-review added read filters.
2. **Cookie-scoped SSR client** — cross-user tests need two sessions, not a single client with swapped `user_id` in query code.
3. **History is append-only for clients** — user DELETE denied by grant + missing policy; pruning is server-only via trigger.
4. **Favorites are immutable** — no UPDATE policy by design (delete + re-save).

## Historical Context (from prior changes)

- `context/changes/domain-data-schema/plan.md` — F-01 defined all policies; manual RLS checklist; automated tests explicitly deferred.
- `context/changes/domain-data-schema/plan-brief.md:67-68` — "No automated RLS tests"; Studio admin bypasses RLS.
- `context/changes/pantry-crud/reviews/impl-review.md` — GET without `.eq("user_id")` was a gap if RLS misconfigured; fixed.
- `context/changes/meal-favorites/plan.md` — consumes F-01 RLS; no new policies.

## Related Research

(none — first research artifact for test rollout)

## Decisions

Resolved 2026-06-06 (owner: user):

1. **Phase 1 exit criteria:** **Tier A (RLS-only) sufficient.** Vitest + cross-user policy tests on all three domain tables via `.env.test`; Tier B HTTP integration deferred to test-plan Phase 2.
2. **Test-plan backport:** Risk #6 response guidance updated in `context/foundation/test-plan.md` §2 (2026-06-06).
3. **CI / Supabase:** **Local-only** for Phase 1 — `pnpm test` with `.env.test` on the developer machine; no GitHub Actions test job; no Docker requirement.
4. **Env guard:** **Yes** — add a server startup assert that `SUPABASE_KEY` is the anon key (not service-role), so misconfiguration cannot silently bypass RLS in production paths.
5. **Test env:** **`.env.test` only** — Supabase URL + anon key point at the developer's dev project; not `npx supabase start` / Docker (corrected 2026-06-06).
