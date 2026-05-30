# Auth Flow for MVP — Plan Brief

> Full plan: `context/changes/auth-flow-for-mvp/plan.md`

## What & Why

Close the remaining gaps in the existing auth scaffold so the full register → confirm → sign-in → protected screen → sign-out loop works correctly for real users. The auth infrastructure is ~80% done; this plan fixes redirect targets, adds auth-page guards, and wires the email-confirmation callback before pantry work (S-02) ships.

## Starting Point

Supabase SSR cookie-based auth is fully wired. Three API routes, two auth pages with React form islands, and `/dashboard` route protection are all present. The gaps are: wrong redirect destinations on sign-in and sign-out, no guard to bounce authenticated users off auth pages, missing `prerender = false` and zod validation on API routes (AGENTS.md hard rules), and no `/auth/callback` route to handle Supabase's email confirmation link.

## Desired End State

A user can register, confirm their email (or skip confirmation in dev), sign in and land on `/dashboard`, sign out and land on `/auth/signin`. Authenticated users visiting `/auth/signin` or `/auth/signup` are redirected to `/dashboard`. The email-confirmation link from Supabase leads to `/auth/callback`, exchanges the code for a session, and drops the user on `/dashboard`. All three API routes pass lint and build cleanly under workerd.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Post-login destination | `/dashboard` | Matches S-01's stated outcome — "reach a protected core screen after authentication". |
| Post-signout destination | `/auth/signin` | Clear UX: signed-out users are placed at the login screen, not the ambiguous public home page. |
| Auth-page guard | Redirect authenticated users to `/dashboard` | Prevents redundant/confusing re-login for already-signed-in users. |
| Email callback route | Add `/auth/callback` (PKCE code exchange) | Without it, Supabase confirmation emails lead to a URL the app doesn't handle. |
| Dashboard content | Keep as minimal stub | Pantry UI is S-02; S-01 only needs to prove route protection works. |
| Zod installation | `pnpm add zod` (Phase 1 prerequisite) | Not yet in `package.json`; AGENTS.md requires zod for all API route validation. |

## Scope

**In scope:**
- `prerender = false` + zod validation on all three auth API routes
- Sign-in redirect fix: `/` → `/dashboard`
- Sign-out redirect fix: `/` → `/auth/signin`
- `emailRedirectTo` on signup pointing to `/auth/callback`
- Middleware guard: authenticated users on `/auth/signin` or `/auth/signup` → `/dashboard`
- New `src/pages/auth/callback.astro` handling PKCE code exchange

**Out of scope:**
- `?next=` / intended-destination redirect
- Dashboard page content (stays as is)
- Auth form components (client-side validation already solid)
- OAuth or passwordless login
- App-level observability

## Architecture / Approach

Classic server-side redirect flow with no new UI. Phase 1 touches only the three existing API route files (plus a `pnpm add zod`). Phase 2 adds one guard block to `src/middleware.ts`. Phase 3 adds a single new Astro page that performs a server-side PKCE code exchange via the already-wired `supabase.auth.exchangeCodeForSession` call — the existing `setAll` cookie handler in `src/lib/supabase.ts` writes the session automatically.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Route Compliance + Redirect Fixes | All three API routes are AGENTS.md-compliant; login → `/dashboard`; signout → `/auth/signin` | zod must be installed first or imports will fail |
| 2. Middleware Auth-Page Guard | Signed-in users bounced off `/auth/signin` and `/auth/signup` | Ordering matters — guard runs after user is resolved, before `PROTECTED_ROUTES` check |
| 3. Email Confirmation Callback | `/auth/callback` exchanges Supabase PKCE code for a session | Requires Supabase dashboard allow-list update for the callback URL in production |

**Prerequisites:** Supabase project connected (local or hosted). For Phase 3 manual testing: hosted Supabase with email confirmation enabled + callback URL added to the allow-list.
**Estimated effort:** ~1 session across 3 phases (Phase 1 is the bulk; Phases 2 and 3 are each a single file change).

## Open Risks & Assumptions

- If the Supabase project has email confirmation disabled (common in local dev with `supabase start`), Phase 3's callback route will never be invoked — that is expected and not a blocker.
- The `/auth/callback` URL must be added to the Supabase dashboard's redirect allow-list before going to production, or `exchangeCodeForSession` will return a redirect-not-allowed error.

## Success Criteria (Summary)

- Full register → sign-in → dashboard → sign-out loop works end-to-end in both local dev and a hosted Supabase project
- Authenticated users visiting auth pages are redirected to `/dashboard`; unauthenticated users visiting `/dashboard` are redirected to `/auth/signin`
- `pnpm run lint` and `pnpm run build` pass cleanly across all changed files
