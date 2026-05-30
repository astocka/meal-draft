<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Flow for MVP

- **Plan**: `context/changes/auth-flow-for-mvp/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-30
- **Verdict**: SOUND (updated after triage — all findings fixed)
- **Findings**: 0 critical · 1 warning · 2 observations (all resolved)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS (fixed) |

## Grounding

5/5 paths ✓ (`callback.astro` correctly absent — new file), 3/3 symbols ✓ (`createClient`, `PROTECTED_ROUTES`, `exchangeCodeForSession` on `@supabase/auth-js@2.106.1`), brief↔plan ✓

## Findings

### F1 — callback.astro Contract omits the createClient null guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — `callback.astro` Contract
- **Detail**: `createClient()` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing (`supabase.ts:5-8`). All three existing API routes guard against this immediately after calling `createClient` (`signin.ts:10-12`, `signup.ts:10-12`, `signout.ts:5-7`). The Phase 3 Contract says "Create the Supabase client via `createClient`. Call `await supabase.auth.exchangeCodeForSession(code)`" with no null check. An implementer following the Contract literally will produce code that throws `TypeError: Cannot read properties of null (reading 'auth')` whenever env vars are absent.
- **Fix**: Extend the Contract with "If `supabase` is null, `return Astro.redirect('/auth/signin?error=Supabase+is+not+configured')` before calling `exchangeCodeForSession`."
- **Decision**: FIXED — null guard added to Phase 3 Contract before `exchangeCodeForSession` call.

---

### F2 — Astro.redirect convention unexplained; implementer may reach for context.redirect by muscle memory

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — `callback.astro` Contract / Critical Implementation Details
- **Detail**: Verification found 0 uses of `Astro.redirect` anywhere in `src/`. Every existing redirect uses `context.redirect` (middleware:21, signin.ts:11+19, signup.ts:11+19, signout.ts:9). `callback.astro` will be the first `.astro` page to perform a server-side redirect. `Astro.redirect` is correct here — `context` is not available in `.astro` frontmatter — but an implementer accustomed to the codebase pattern may instinctively type `context.redirect`, get a runtime error, and lose time debugging.
- **Fix**: Add one sentence to Critical Implementation Details: "`.astro` page frontmatter must use `return Astro.redirect(path)` — `context.redirect` is only available in middleware and API routes."
- **Decision**: FIXED — note added to Critical Implementation Details clarifying `.astro` frontmatter must use `Astro.redirect`.

---

### F3 — Desired End State item 6 has no backing phase

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State, item 6
- **Detail**: Item 6 — "Visit any protected route while unauthenticated → redirect to `/auth/signin`" — is already satisfied by the existing `PROTECTED_ROUTES` middleware guard (`middleware.ts:18-21`). No phase touches this behavior. An implementer doing a phase traceability check will find no phase backing this item and may wonder if something was missed.
- **Fix**: Append "(pre-existing behavior; no change required)" to item 6.
- **Decision**: FIXED — appended "(pre-existing behavior; no change required)" to Desired End State item 6.
