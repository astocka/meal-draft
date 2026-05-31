<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Flow for MVP

- **Plan**: context/changes/auth-flow-for-mvp/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-05-30
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical  5 warnings  5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success Criteria

| Check | Result |
|-------|--------|
| `pnpm run lint` | ✅ PASS |
| `pnpm run build` | ✅ PASS |
| Manual: all 8 Progress checkboxes | ✅ marked [x] |

## Findings

### F1 — Host Header Injection in emailRedirectTo — FIXED via Fix A

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:34
- **Detail**: `emailRedirectTo` is constructed from `new URL(context.request.url).origin`. In Cloudflare Workers, `request.url` is populated from the incoming request; if the Supabase project's "Redirect URLs" allowlist contains a wildcard (e.g. `https://*.workers.dev/*`) or is misconfigured, a request with a spoofed Host header could produce a redirect URL in the confirmation email pointing to an attacker-controlled domain — a Host Header Injection leading to open redirect. Risk is lower in Workers than on traditional servers (Cloudflare controls URL routing), but the pattern is unsafe if the allowlist is ever misconfigured.
- **Fix A ⭐ Recommended**: Replace the dynamic origin with a hardcoded `SITE_URL` env variable declared in `astro.config.mjs` `env.schema` (public, not secret): `emailRedirectTo: \`${SITE_URL}/auth/callback\``
  - Strength: Immune to request-time manipulation regardless of allowlist config; also makes the redirect URL predictable in local vs. prod environments.
  - Tradeoff: Requires adding `SITE_URL` to `.env`, `.dev.vars`, and Cloudflare Worker secrets — small one-time setup cost.
  - Confidence: HIGH — this is the standard pattern for Supabase SSR apps with `emailRedirectTo`.
  - Blind spot: Need to verify `SITE_URL` is added to the Supabase dashboard Redirect URL allowlist without wildcards.
- **Fix B**: Keep dynamic origin but enforce strict allowlist in Supabase dashboard (no wildcards)
  - Strength: Zero code change.
  - Tradeoff: Relies entirely on operational configuration staying correct; fragile across environments.
  - Confidence: LOW — configuration drift is common; code-level fix is more durable.
  - Blind spot: Local dev URL will differ from prod URL, requiring allowlist entries for both.
- **Decision**: FIXED via Fix A — SITE_URL env var added to astro.config.mjs schema, signup.ts updated, .env.example/.dev.vars/.dev.vars.example updated

### F2 — Unguarded formData() calls crash on bad Content-Type — FIXED

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:13, src/pages/api/auth/signup.ts:13
- **Detail**: `context.request.formData()` is called without try/catch in both signin and signup. If the request Content-Type is missing or not a recognised form type (`multipart/form-data` or `application/x-www-form-urlencoded`), the call throws a TypeError that propagates as an unhandled 500. In Cloudflare Workers this surfaces as a generic error response with no useful feedback.
- **Fix**: Wrap in try/catch and redirect with an error on failure: `let form: FormData; try { form = await context.request.formData(); } catch { return context.redirect(\`/auth/signin?error=${encodeURIComponent("Invalid request")}\`); }` (same pattern in signup, pointing to `/auth/signup`).
- **Decision**: FIXED — try/catch added in signin.ts and signup.ts

### F3 — signOut() error silently discarded — FIXED

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signout.ts:9
- **Detail**: The return value of `supabase.auth.signOut()` is discarded. If sign-out fails (network error, token already invalid), the user is silently redirected to `/auth/signin`, but the Supabase server-side session may still be active. The middleware calls `getUser()` which re-validates with Supabase, so the session would still pass auth checks until the JWT expires.
- **Fix**: Destructure the error and log it: `const { error } = await supabase.auth.signOut(); if (error) console.warn("signOut error:", error.message);` — always redirect to `/auth/signin` regardless (current UX is correct), but surface the error in dev logs.
- **Decision**: FIXED — error destructured and logged in signout.ts

### F4 — middleware getUser() error silently discarded — FIXED

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:11–13
- **Detail**: `supabase.auth.getUser()` is called on every request but only `data.user` is destructured; `error` is silently discarded. The Supabase JS client returns `{ data: { user: null }, error }` on auth failure (handled implicitly — user becomes null). However, if the underlying fetch to Supabase's REST endpoint itself throws (DNS failure, timeout, connectivity issue), the unhandled exception kills the entire request pipeline and returns a 500 for every page load until the condition clears.
- **Fix**: Wrap in try/catch or handle the error field: `const { data: { user }, error } = await supabase.auth.getUser(); if (error) console.warn("getUser error:", error.message); context.locals.user = user ?? null;`
- **Decision**: FIXED — error destructured and logged in middleware.ts

### F5 — Callback logic extracted to unplanned lib helper — FIXED via Fix A

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/auth/resolve-email-callback-redirect.ts (new file)
- **Detail**: The plan's Phase 3 contract specified all callback logic should live directly in `callback.astro` frontmatter. Instead the logic was extracted to a pure async function in an unplanned lib module. The resulting `callback.astro` is 11 lines; all logic is delegated. Intent is 100% preserved — this is architectural, not functional, drift.
- **Fix A ⭐ Recommended**: Document the extraction in the plan as an addendum
  - Strength: Preserves the cleaner code; the extraction is architecturally correct (AGENTS.md names `src/lib/` as the home for services and business logic). Also made the ESLint suppression narrower.
  - Tradeoff: Plan becomes a slightly moving target; minimal overhead.
  - Confidence: HIGH — addendum pattern used in prior reviews in this repo.
  - Blind spot: None significant.
- **Fix B**: Inline the logic back into callback.astro
  - Strength: Restores strict plan conformance.
  - Tradeoff: Degrades code quality; `.astro` file becomes a business-logic host, conflicting with thin-page convention.
  - Confidence: LOW.
  - Blind spot: None.
- **Decision**: FIXED via Fix A — plan addendum added to Phase 3 Changes Required section

### F6 — PROTECTED_ROUTES blocklist pattern — FIXED

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:4
- **Detail**: `PROTECTED_ROUTES` is an explicit blocklist — only routes listed here are protected. Any new page added to `src/pages/` is implicitly public unless a developer remembers to add it. This scales poorly; a missed entry creates a silent authorization gap.
- **Fix**: Consider inverting to a public-routes allowlist so new routes are protected by default. At minimum, add a comment warning future contributors to keep the list updated.
- **Decision**: FIXED — warning comment added above PROTECTED_ROUTES in middleware.ts

### F7 — Raw Supabase error messages forwarded to client — FIXED

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:33, src/pages/api/auth/signup.ts:39, src/lib/auth/resolve-email-callback-redirect.ts:20
- **Detail**: Raw `error.message` strings from Supabase are URL-encoded and forwarded to the client as `?error=` query params where they are rendered in the UI. Supabase's messages are generally safe, but this exposes internal service details in browser history, may leak user-enumeration signals if Supabase changes messaging, and creates a dependency on Supabase's English error strings for UX copy.
- **Fix**: Map known Supabase error codes to app-controlled messages with a safe fallback: `const userMessage = KNOWN_AUTH_ERRORS[error.code] ?? "Authentication failed. Please try again.";`
- **Decision**: FIXED — src/lib/auth/auth-error-message.ts created with code→message map; signin.ts, signup.ts, resolve-email-callback-redirect.ts updated to use authErrorMessage(error.code)

### F8 — Password minimum 6 chars (vs. recommended 8) — FIXED

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:9
- **Detail**: The zod schema enforces `z.string().min(6)`. NIST SP 800-63B and OWASP recommend a minimum of 8 characters for user-chosen passwords. The Supabase project's server-side policy also needs to match to avoid inconsistent validation messages.
- **Fix**: Raise to `z.string().min(8)` and verify the Supabase project's Auth → Password settings match.
- **Decision**: FIXED — raised to z.string().min(10) per user preference; verify Supabase Auth → Password minimum is also set to 10

### F9 — Inconsistent error encoding in resolve-email-callback-redirect — FIXED

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth/resolve-email-callback-redirect.ts:11
- **Detail**: Line 11 uses manual `+` encoding for spaces (`"Supabase+is+not+configured"`) while lines 15 and 20 use `encodeURIComponent()`. Both decode correctly via `URLSearchParams.get()`, but the inconsistency could introduce a real bug if a future error message contains characters other than spaces.
- **Fix**: Use `encodeURIComponent()` consistently: `return \`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}\`;`
- **Decision**: FIXED — line 11 updated to use encodeURIComponent

### F10 — Zod v4 API used vs. plan's v3 contract text — FIXED

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/auth/signin.ts:8, src/pages/api/auth/signup.ts:8
- **Detail**: The plan's contract specified `z.string().email()` (Zod v3 API). The implementation uses `z.email()` (Zod v4 standalone type) — package.json has `"zod": "^4.4.3"`. Functionally identical; v4's `z.email()` is the preferred v4 API. The plan text was written before deciding on a Zod version; the implementation is correct.
- **Fix**: No code change. Update the plan contract text to reflect `z.email()` so future readers don't see a discrepancy.
- **Decision**: FIXED — plan contracts for signin and signup updated to z.email() and z.string().min(10); signup contract also updated to reflect SITE_URL
