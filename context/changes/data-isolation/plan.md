# Data Isolation (Test Rollout Phase 1) Implementation Plan

## Overview

Bootstrap Vitest and ship **Tier A** integration tests that prove cross-user data isolation at the Supabase RLS layer for `pantry_products`, `favorite_meals`, and `generation_history`. Add a server-side guard so a misconfigured service-role `SUPABASE_KEY` cannot silently bypass RLS. Update the test-plan cookbook so future RLS tests follow the same pattern.

Covers test-plan Risks **#1** (RLS gap) and partial **#6** (IDOR at DB layer). Tier B HTTP route tests remain deferred to test-plan Phase 2.

## Current State Analysis

- F-01 migration defines granular RLS on all three tables — `(select auth.uid()) = user_id` per operation (`supabase/migrations/20260528120000_domain_data_schema.sql:114-175`).
- App routes add defense-in-depth `.eq("user_id", user.id)` filters; no service-role client in `src/`.
- **No test runner** — `package.json` has no `test` script; CI runs lint + build only.
- F-01 verified RLS manually via Studio JWT simulation; no automated cross-user suite (`context/changes/domain-data-schema/plan.md:218-240`).
- Research decisions locked: Tier A sufficient, local-only (no CI Supabase), env guard yes, `tests/integration/` layout, `beforeAll` signUp for two users, guard on first `createClient()`.

### Key Discoveries

- `createClient()` returns `null` when env unset — guard must not throw in that case (`src/lib/supabase.ts:6-8`).
- Supabase anon and service-role keys are JWTs; decode payload `role` claim to distinguish (`research.md` Decisions #4).
- Tests must use **anon key + user JWT** from `signInWithPassword` — never app service-role.
- `generation_history` has no client UPDATE/DELETE grant — assert denial, not cross-user mutation.
- `favorite_meals` has no UPDATE policy — cross-user UPDATE test applies to `pantry_products` only; favorites get SELECT/INSERT/DELETE coverage.

## Desired End State

1. Developer configures `.env.test` with Supabase URL + anon key, then `pnpm test` — RLS cross-user suite passes locally.
2. Tests prove User A cannot read, insert-as-B, update, or delete User B's rows on all three tables (operations permitted by grants).
3. `createClient()` throws a clear error if `SUPABASE_KEY` decodes to `role: service_role`.
4. `context/foundation/test-plan.md` §6.2 documents the integration test pattern; §6.6 notes Phase 1 learnings.
5. `pnpm run lint` and `pnpm run build` still pass; CI unchanged (no test job).

## What We're NOT Doing

- Tier B HTTP / IDOR route tests (test-plan Phase 2).
- CI Supabase Docker job (local-only per research Decision #3).
- Playwright, MSW, or component tests.
- Changing RLS policies or API route semantics (e.g. DELETE 204 behavior).
- Service-role client in application code or test assertions paths.
- Wiring `pnpm test` into `.github/workflows/ci.yml`.

## Implementation Approach

Four phases:

1. **Vitest bootstrap** — runner, config, `pnpm test`, test env template.
2. **Env guard + test helpers** — anon-key assert in `createClient()`; shared helpers for local Supabase + two-user auth.
3. **RLS cross-user suite** — integration tests in `tests/integration/` covering Risk #1 matrix from research.
4. **Cookbook + docs** — test-plan §6.2, AGENTS.md test commands, change metadata.

## Critical Implementation Details

**Local Supabase required:** Tests assume a reachable Supabase project (URL + anon key in `.env.test`). Document variables in `.env.test.example`. Tests skip or fail fast with a clear message if env vars missing — do not hang. No Docker or CI requirement — local `pnpm test` only.

**Two-user provisioning:** `beforeAll` in the integration suite signs up User A and User B via Auth API with credentials from env (e.g. `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`). Use unique emails per run or delete/recreate if signUp returns "already registered" (signIn fallback). Seed User B's rows using **User B's authenticated client** before cross-user assertions.

**Oracle source:** Expected outcomes come from migration policies and F-01 manual checklist — not from copying app route handlers. SELECT cross-user → empty array; INSERT with foreign `user_id` → PostgREST/RLS error; UPDATE/DELETE foreign row → zero rows / error; pantry UPDATE attempting `user_id` reassignment → denied.

**Env guard scope:** Run guard inside `createClient()` when `SUPABASE_KEY` is present. Allow missing key (returns `null` unchanged). Throw `Error` with actionable message if JWT payload `role === 'service_role'`. Do not run guard in Vitest test client factory if tests use a dedicated helper that already validates anon key — app path must be guarded.

---

## Phase 1: Vitest Bootstrap

### Overview

Add Vitest, project config, and `pnpm test` script. Establish test env contract for local Supabase.

### Changes Required

#### 1. Dependencies and scripts

**File**: `package.json`

**Intent**: Add Vitest as dev dependency and expose `pnpm test` for local integration runs.

**Contract**: `devDependencies` includes `vitest` (current stable); `scripts.test` runs `vitest run`. Optional: `test:watch` for local dev — only if it matches repo script style.

#### 2. Vitest config

**File**: `vitest.config.ts` (project root)

**Intent**: Configure Vitest for Node integration tests with path alias `@/` matching Astro/Vite.

**Contract**: `test.include` targets `tests/**/*.test.ts`; `test.environment` is `node`; longer `testTimeout` (e.g. 30s) for Supabase network; resolve alias `@` → `src/` consistent with `tsconfig.json`.

#### 3. Test environment template

**File**: `.env.test.example`

**Intent**: Document required env vars for integration tests without committing secrets.

**Contract**: Variables for `SUPABASE_URL`, `SUPABASE_KEY` (local anon), `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`. README or AGENTS.md pointer to copy from `supabase status` + choose test passwords.

#### 4. Gitignore

**File**: `.gitignore`

**Intent**: Ignore `.env.test` if developers copy the example locally.

**Contract**: Add `.env.test` entry if not already present.

### Success Criteria

#### Automated Verification

- `pnpm install` succeeds
- `pnpm test` runs (may fail until Phase 3 tests exist — after Phase 1, empty or placeholder suite passes)

#### Manual Verification

- Vitest discovers files under `tests/integration/` once added

**Implementation Note**: Pause for human confirmation after Phase 1 before Phase 2.

---

## Phase 2: Env Guard + Test Helpers

### Overview

Prevent service-role misconfiguration in production paths. Shared helpers for authenticated Supabase clients in tests.

### Changes Required

#### 1. Anon key assertion

**File**: `src/lib/assert-supabase-anon-key.ts` (new)

**Intent**: Decode Supabase JWT key and reject service-role before any server client is created.

**Contract**: Export `assertSupabaseAnonKey(key: string): void` — parse JWT payload (middle segment, base64url), read `role`; throw if `role === 'service_role'`; no-op or allow if `role === 'anon'`. Invalid JWT → throw with clear message (misconfiguration, not silent pass).

#### 2. Wire guard into server client

**File**: `src/lib/supabase.ts`

**Intent**: Call assert before `createServerClient` when `SUPABASE_KEY` is set.

**Contract**: Import and invoke `assertSupabaseAnonKey(SUPABASE_KEY)` after null check on URL/key, before client construction. Behavior when key missing unchanged (`return null`).

#### 3. Unit test for guard (optional colocated)

**File**: `src/lib/assert-supabase-anon-key.test.ts`

**Intent**: Lock guard behavior without live Supabase — use fixture JWT strings or mocked payloads.

**Contract**: Cases — anon key passes; service_role throws; malformed key throws.

#### 4. Integration test helpers

**File**: `tests/helpers/supabase-test-client.ts` (new)

**Intent**: Factory for anon clients and auth helpers used by RLS suite.

**Contract**: Export `getTestEnv()` reading required env vars with descriptive missing-var errors; `createAuthClient()` using `createClient` from `@supabase/supabase-js` with anon key; `signUpOrSignIn(email, password)` returning `{ client, userId }`; `seedPantryRow(client, name)` etc. as needed for seeding. Helpers use **anon key only**.

#### 5. Load test env in Vitest

**File**: `vitest.config.ts` or `tests/setup.ts`

**Intent**: Load `.env.test` for local runs.

**Contract**: Use `dotenv` or Vitest `envDir`/`loadEnv` so `pnpm test` picks up `.env.test` when present.

### Success Criteria

#### Automated Verification

- Guard unit tests pass: `pnpm test src/lib/assert-supabase-anon-key.test.ts`
- `pnpm run lint` passes
- `pnpm run build` passes (guard imported by `supabase.ts`)

#### Manual Verification

- Temporarily set service-role key in local env → first API request or `createClient()` throws readable error

**Implementation Note**: Pause for human confirmation after Phase 2 before Phase 3.

---

## Phase 3: RLS Cross-User Integration Suite

### Overview

Automate F-01 RLS checklist as Tier A tests — User A vs User B on all three domain tables.

### Changes Required

#### 1. Main integration test file

**File**: `tests/integration/rls-cross-user.test.ts`

**Intent**: Prove Risk #1 — cross-user denial at RLS layer using two real auth sessions.

**Contract**: Single `describe` with shared `beforeAll`: provision User A and B; seed one row per table owned by B (minimal valid shapes — pantry name, favorite recipe JSON with `name`, history row with `meal_type`). Tests run as **User A's client**:

| Table | Assert |
|-------|--------|
| `pantry_products` | SELECT → no B rows; INSERT with `user_id: B` → error; UPDATE B row by id → no effect/error; DELETE B row → no effect; UPDATE own row setting `user_id: B` → denied |
| `favorite_meals` | SELECT → no B rows; INSERT with `user_id: B` → error; DELETE B row → no effect |
| `generation_history` | SELECT → no B rows; INSERT with `user_id: B` → error; UPDATE/DELETE any row → denied (including own — append-only) |

Use independent assertions — empty `data` arrays, non-null `error`, or row count checks via B's client confirming B's data still exists after A's attempts.

**Regression caught:** RLS policy gap, missing `WITH CHECK`, or grant allowing cross-user access.

**Research source:** `research.md` Tier A matrix; `domain-data-schema/plan.md:218-240`.

**Edge case:** `generation_history` client DELETE denied even on own rows — assert policy/grant behavior, not cross-user only.

**Anti-pattern avoided:** Happy-path-only own-user CRUD; mocking Supabase client.

#### 2. Skip guard when Supabase unavailable

**File**: `tests/integration/rls-cross-user.test.ts`

**Intent**: CI without Supabase does not fail lint/build; test run fails clearly locally when env missing.

**Contract**: At file top, if required env vars absent, `describe.skip` or single skipped test with message "Configure .env.test (see .env.test.example)".

### Success Criteria

#### Automated Verification

- `pnpm test` passes with `.env.test` configured
- `pnpm run lint` passes
- `pnpm run build` passes

#### Manual Verification

- Unset or incomplete `.env.test` → `pnpm test` reports clear skip/fail message (not opaque timeout)
- Break one RLS policy locally (temp) → relevant test fails

**Implementation Note**: Pause for human confirmation after Phase 3 before Phase 4.

---

## Phase 4: Cookbook, Docs, and Change Metadata

### Overview

Document the pattern for future contributors; update test-plan cookbook per rollout contract.

### Changes Required

#### 1. Test-plan cookbook §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: Replace TBD with concrete integration test recipe (Risk #1 pattern).

**Contract**: §6.2 includes — location `tests/integration/`; naming `*.test.ts`; reference test `tests/integration/rls-cross-user.test.ts`; run `pnpm test` locally with `.env.test` configured; two-user Auth API setup; anti-pattern note (no service-role in assertions). §6.6 append 2-3 line Phase 1 note (e.g. local-only, env guard location).

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Intent**: Agents know how to run tests and local Supabase prerequisite.

**Contract**: Commands section adds `pnpm test` — requires `.env.test` with Supabase URL + anon key; local-only, CI does not run tests yet. Note env guard on `SUPABASE_KEY`.

#### 3. Change identity

**File**: `context/changes/data-isolation/change.md`

**Intent**: Per lessons.md — Outcome, Prerequisites, PRD refs for traceability.

**Contract**: Under Notes add `### Outcome`, `### Prerequisites`, `### PRD refs` from test-plan Phase 1; set `status: planned`.

#### 4. Test-plan §3 status

**File**: `context/foundation/test-plan.md`

**Intent**: Orchestrator state — phase moves to `planned`.

**Contract**: Phase 1 row Status → `planned` (or `implementing` once work starts via `/10x-implement`).

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes

#### Manual Verification

- Fresh agent reading AGENTS.md + test-plan §6.2 can add a new table RLS test without guessing layout

---

## Testing Strategy

### Integration Tests (Tier A — in scope)

- Cross-user SELECT/INSERT/UPDATE/DELETE matrix per table grants
- Env guard unit tests for JWT role detection
- All tests use anon key + real auth sessions

### Manual Testing Steps

1. Configure `.env.test` from `.env.test.example` with Supabase URL + anon key + test user passwords
2. `pnpm test` — all green
3. Swap `SUPABASE_KEY` to service-role in `.env` → start preview → confirm error on first protected DB access
4. `pnpm run build && pnpm run preview` — smoke dashboard still loads with correct anon key

## Performance Considerations

Integration suite is small (single file, ~15–20 cases). `beforeAll` auth setup once per file. 30s timeout sufficient.

## Migration Notes

None — no schema changes.

## References

- Research: `context/changes/data-isolation/research.md`
- Test plan: `context/foundation/test-plan.md` §2 Risks #1, #6; §3 Phase 1
- RLS migration: `supabase/migrations/20260528120000_domain_data_schema.sql`
- F-01 manual RLS checklist: `context/changes/domain-data-schema/plan.md` (Testing Strategy §3)
- Server client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `pnpm install` succeeds with vitest added
- [x] 1.2 `pnpm test` runs (vitest executes)

#### Manual

- [x] 1.3 `.env.test.example` documents required variables

### Phase 2: Env Guard + Test Helpers

#### Automated

- [ ] 2.1 Guard unit tests pass (`pnpm test` for assert module)
- [ ] 2.2 `pnpm run lint` passes
- [ ] 2.3 `pnpm run build` passes

#### Manual

- [ ] 2.4 Service-role key in env throws on `createClient()`

### Phase 3: RLS Cross-User Integration Suite

#### Automated

- [ ] 3.1 `pnpm test` passes with `.env.test` configured
- [ ] 3.2 `pnpm run lint` passes
- [ ] 3.3 `pnpm run build` passes

#### Manual

- [ ] 3.4 Missing or incomplete `.env.test` yields clear message
- [ ] 3.5 Temporarily broken policy causes test failure

### Phase 4: Cookbook, Docs, and Change Metadata

#### Automated

- [ ] 4.1 `pnpm run lint` passes

#### Manual

- [ ] 4.2 test-plan §6.2 cookbook filled in
- [ ] 4.3 AGENTS.md lists `pnpm test` + prerequisites
