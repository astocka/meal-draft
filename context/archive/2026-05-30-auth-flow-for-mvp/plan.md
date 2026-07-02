# Auth Flow for MVP — Implementation Plan

## Overview

Complete the MVP auth user journey (S-01) by fixing redirect targets, adding middleware guards that bounce authenticated users away from auth pages, wiring the Supabase email-confirmation callback route, and bringing all three auth API routes into AGENTS.md compliance (zod validation + `prerender = false`).

The existing auth scaffold is ~80% done: Supabase SSR cookies, three API routes, two auth pages with React form islands, and `/dashboard` protection are all in place. This plan closes the remaining gaps so the full register → confirm → sign-in → protected screen → sign-out loop works in production.

## Current State Analysis

Cookie-based Supabase SSR auth (`@supabase/ssr`) is wired. `src/middleware.ts` resolves `context.locals.user` on every request and only protects `/dashboard`. The three API routes handle the happy path but redirect to the wrong destinations and violate AGENTS.md conventions.

### Key Discoveries

- `signin.ts` redirects to `/` on success — must be `/dashboard` (`src/pages/api/auth/signin.ts:19`)
- `signout.ts` redirects to `/` on success — must be `/auth/signin` (`src/pages/api/auth/signout.ts:9`)
- `PROTECTED_ROUTES = ["/dashboard"]` only — no guard for authenticated users on `/auth/signin` or `/auth/signup` (`src/middleware.ts:4`)
- All three API routes lack `export const prerender = false` (AGENTS.md hard rule)
- `signin.ts` and `signup.ts` use raw `form.get() as string` casts with no validation (AGENTS.md requires zod)
- `signup.ts` calls `supabase.auth.signUp` without `emailRedirectTo` — email confirmation links will point to the Supabase default URL, not the app's `/auth/callback` route
- No `/auth/callback` route exists; zod is not yet in `package.json`

## Desired End State

A user can:

1. Register with email + password → land on `/auth/confirm-email` (dev: auto-confirmed; prod: check-email message)
2. Click the Supabase email confirmation link → `/auth/callback` exchanges the code for a session → `/dashboard`
3. Sign in with valid credentials → `/dashboard` (protected)
4. Sign out → `/auth/signin`
5. Visit `/auth/signin` or `/auth/signup` while already signed in → redirect to `/dashboard`
6. Visit any protected route while unauthenticated → redirect to `/auth/signin` (pre-existing behavior; no change required)

All API routes pass `pnpm run lint` and `pnpm run build` cleanly.

## What We're NOT Doing

- No `?next=` / intended-destination redirect (S-01 scope; add in a future slice)
- No OAuth or passwordless login (parked in roadmap)
- No changes to the dashboard page content (stays as minimal shell; pantry UI is S-02)
- No changes to auth form components (`SignInForm.tsx`, `SignUpForm.tsx`) — client-side validation is already solid
- No app-level observability / error tracking (parked in roadmap)

## Implementation Approach

Three phases, each independently verifiable:

1. **API route compliance + redirect fixes** — all three API routes get `prerender = false` and correct redirect targets; signin/signup get zod schemas; signup gets `emailRedirectTo`.
2. **Middleware auth-page guard** — authenticated users visiting `/auth/signin` or `/auth/signup` are bounced to `/dashboard`.
3. **Email confirmation callback** — new `src/pages/auth/callback.astro` handles the Supabase PKCE code exchange and redirects to `/dashboard`.

## Critical Implementation Details

- **zod must be installed before Phase 1**: run `pnpm add zod` first. The package is not in `package.json` yet.
- **`emailRedirectTo` origin**: derive from `new URL(context.request.url).origin` in `signup.ts` — this gives the correct origin in both local Cloudflare workerd (`wrangler dev`) and production without needing a separate `SITE_URL` env var.
- **PKCE callback**: `supabase.auth.exchangeCodeForSession(code)` writes the session cookies via the `setAll` cookie handler already wired in `src/lib/supabase.ts`. No changes to `supabase.ts` are needed.
- **Redirect in `.astro` frontmatter**: use `return Astro.redirect(path)` — `context.redirect` is only available in middleware and API routes, not in `.astro` page frontmatter.

---

## Phase 1: API Route Compliance + Redirect Fixes

### Overview

Add `prerender = false` to all three API routes, introduce zod input validation on signin and signup, fix redirect destinations, and add `emailRedirectTo` to signup. Install zod as a prerequisite.

### Changes Required

#### 0. Install zod

**Intent**: Add zod to project dependencies so API routes can import it.

**Contract**: Run `pnpm add zod` in the project root before editing any source files.

#### 1. `src/pages/api/auth/signin.ts`

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Add `prerender = false`, parse and validate form fields with zod, and redirect to `/dashboard` on success instead of `/`.

**Contract**: Export `const prerender = false` at the top. Define a zod schema `z.object({ email: z.email(), password: z.string().min(1) })`. Use `safeParse` on the raw form data; on failure, redirect to `/auth/signin?error=<first zod message>`. On Supabase success, redirect to `/dashboard`.

#### 2. `src/pages/api/auth/signup.ts`

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Add `prerender = false`, validate with zod, and set `emailRedirectTo` so Supabase confirmation emails point to the app's `/auth/callback` route.

**Contract**: Export `const prerender = false`. Schema: `z.object({ email: z.email(), password: z.string().min(10) })`. Pass `options: { emailRedirectTo: \`${SITE_URL}/auth/callback\` }`to`supabase.auth.signUp`. Redirect target on success stays `/auth/confirm-email`.

#### 3. `src/pages/api/auth/signout.ts`

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Add `prerender = false` and redirect to `/auth/signin` on success instead of `/`.

**Contract**: Export `const prerender = false`. Change the final `return context.redirect("/")` to `return context.redirect("/auth/signin")`.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes with no new errors
- `pnpm run build` completes without errors

#### Manual Verification

- Sign in with valid credentials → lands on `/dashboard`
- Sign in with invalid credentials → sign-in page with error message
- Sign out → lands on `/auth/signin`
- Register with valid email + password → lands on `/auth/confirm-email`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Middleware — Authenticated-User Guard for Auth Pages

### Overview

Update `src/middleware.ts` to redirect already-authenticated users away from `/auth/signin` and `/auth/signup`, sending them to `/dashboard` instead.

### Changes Required

#### 1. `src/middleware.ts`

**File**: `src/middleware.ts`

**Intent**: Add a second route list (`AUTHENTICATED_ROUTES`) — auth pages that should be inaccessible once signed in — and redirect authenticated visitors of those routes to `/dashboard`.

**Contract**: Define `const AUTHENTICATED_ROUTES = ["/auth/signin", "/auth/signup"]`. After resolving `context.locals.user`, add a second guard block: if the current path starts with any `AUTHENTICATED_ROUTES` entry AND `context.locals.user` is truthy, return `context.redirect("/dashboard")`. This check runs after the user is resolved but before the `PROTECTED_ROUTES` check.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes
- `pnpm run build` completes without errors

#### Manual Verification

- While signed in, navigate to `/auth/signin` → redirected to `/dashboard`
- While signed in, navigate to `/auth/signup` → redirected to `/dashboard`
- While signed out, navigating to `/auth/signin` → page loads normally

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Email Confirmation Callback Route

### Overview

Create `src/pages/auth/callback.astro` to handle the Supabase PKCE email-confirmation callback. Supabase redirects users to this URL after they click the email confirmation link; the server exchanges the one-time `code` query parameter for a full session.

### Changes Required

#### 1. `src/pages/auth/callback.astro`

**File**: `src/pages/auth/callback.astro` _(new file)_

**Intent**: Receive the `?code=` query param from Supabase's email confirmation redirect, exchange it for a session via `supabase.auth.exchangeCodeForSession`, and send the user to `/dashboard` on success or `/auth/signin?error=...` on failure.

**Contract**: Server-side Astro frontmatter only (no client-side slot content). Get `code` from `Astro.url.searchParams`. Create the Supabase client via `createClient`. If `supabase` is `null`, `return Astro.redirect('/auth/signin?error=Supabase+is+not+configured')` before proceeding. Call `await supabase.auth.exchangeCodeForSession(code)`. On success: `return Astro.redirect("/dashboard")`. On error or missing `code`: `return Astro.redirect(\`/auth/signin?error=${encodeURIComponent(error?.message ?? "Invalid confirmation link")}\`)`.

The `createClient` cookie `setAll` handler already writes session cookies on `exchangeCodeForSession` — no extra wiring needed.

**Implementation addendum**: During implementation, the callback logic was extracted to `src/lib/auth/resolve-email-callback-redirect.ts` — a pure async function that returns a redirect URL string. `callback.astro` delegates to it entirely. This deviates from the contract's inline-frontmatter approach but is architecturally correct: `src/lib/` is the designated home for auth business logic (per AGENTS.md), and the extraction also narrowed the ESLint `no-misused-promises` suppression to a smaller surface.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes
- `pnpm run build` completes without errors

#### Manual Verification

- Register a new account with a real email address in a Supabase project where email confirmation is enabled → receive email → click link → land on `/dashboard` (logged in)
- Visit `/auth/callback` with no `code` param → redirected to `/auth/signin` with error message

**Implementation Note**: The manual test for Phase 3 requires a hosted Supabase project (not local) with email confirmation enabled. For local development with `npx supabase start`, email confirmation is typically disabled and this route will not be exercised — that is expected.

---

## Testing Strategy

### Manual Testing Steps

1. **Full happy path (dev)**: Register → confirm-email page → sign in → dashboard → sign out → back at sign-in page
2. **Full happy path (prod/hosted Supabase with email confirm)**: Register → confirm-email page → click email link → dashboard (auto signed-in)
3. **Error paths**: wrong password → error on sign-in page; sign up with existing email → Supabase error surfaced correctly
4. **Auth-page guard**: While signed in, directly navigate to `/auth/signin` → redirected to `/dashboard`
5. **Protected route guard**: Sign out, then navigate directly to `/dashboard` → redirected to `/auth/signin`
6. **Build smoke test**: `pnpm run build && pnpm run preview` — verify all routes work under workerd (Cloudflare runtime)

## Migration Notes

No database migrations required. Supabase project settings: ensure the site URL and redirect allow-list in the Supabase dashboard includes the `/auth/callback` path (e.g. `http://localhost:4321/auth/callback` for local, `https://yourdomain.com/auth/callback` for prod).

## References

- Roadmap S-01: `context/foundation/roadmap.md` (lines 93–104)
- Change file: `context/changes/auth-flow-for-mvp/change.md`
- Supabase SSR client: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts`
- API routes: `src/pages/api/auth/`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Route Compliance + Redirect Fixes

#### Automated

- [x] 1.1 `pnpm run lint` passes with no new errors — eac9e72
- [x] 1.2 `pnpm run build` completes without errors — eac9e72

#### Manual

- [x] 1.3 Sign in with valid credentials → lands on `/dashboard` — eac9e72
- [x] 1.4 Sign in with invalid credentials → sign-in page with error message — eac9e72
- [x] 1.5 Sign out → lands on `/auth/signin` — eac9e72
- [x] 1.6 Register with valid email + password → lands on `/auth/confirm-email` — eac9e72

### Phase 2: Middleware — Authenticated-User Guard for Auth Pages

#### Automated

- [x] 2.1 `pnpm run lint` passes — 5778f1d
- [x] 2.2 `pnpm run build` completes without errors — 5778f1d

#### Manual

- [x] 2.3 While signed in, navigate to `/auth/signin` → redirected to `/dashboard` — 5778f1d
- [x] 2.4 While signed in, navigate to `/auth/signup` → redirected to `/dashboard` — 5778f1d
- [x] 2.5 While signed out, navigating to `/auth/signin` → page loads normally — 5778f1d

### Phase 3: Email Confirmation Callback Route

#### Automated

- [x] 3.1 `pnpm run lint` passes
- [x] 3.2 `pnpm run build` completes without errors

#### Manual

- [x] 3.3 Email confirmation link → `/auth/callback` → `/dashboard` (requires hosted Supabase with email confirm enabled)
- [x] 3.4 `/auth/callback` with no `code` param → `/auth/signin` with error message
