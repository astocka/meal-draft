# Repository Guidelines

MealDraft is an Astro 6 SSR application with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components, deployed to Cloudflare Workers.

## Hard Rules

- Never concatenate Tailwind class strings manually — use `cn()` from `@/lib/utils`.
- No Next.js directives (`"use client"`, `"use server"`). React islands use Astro `client:*` directives.
- API route files must export `const prerender = false`.
- Always enable RLS on new Supabase tables with granular per-operation, per-role policies.
- Name migrations `YYYYMMDDHHmmss_short_description.sql` in `supabase/migrations/`.
- `SUPABASE_SERVICE_ROLE_KEY` must **never** appear in `astro:env/server` schema. It is read exclusively from the Cloudflare Workers runtime env (`context.locals.runtime.env`) inside `src/pages/api/auth/signup.ts`. This is intentional — keeping it out of the typed schema prevents accidental app-wide imports that would bypass the anon-key guard.
- Invite-code gating is enforced at the application layer only (route + Zod schema in `src/lib/auth/signup-schema.ts`). No database-level constraint exists — this is a deliberate product decision (invite codes are rotated externally, not stored in the DB).

## Project Structure

- `src/pages/` — Astro routes and API endpoints (`api/auth/` for signin, signup, signout; `api/generate.ts` for meal generation)
- `src/components/` — Astro components at root; React islands in subdirs (`dashboard/`, `meal/`, `pantry/`, `favorites/`); `ui/` for shadcn ("new-york" style): `button`, `tabs`, `card`
  - `DashboardTopbar.astro` — top nav bar (logo + desktop links + logout icon button); nav links hidden on mobile (`md:flex`)
  - `BottomNav.astro` — fixed mobile bottom navigation (`md:hidden`); links to `/dashboard` and `/favorites` with filled icons for the active page
  - `Footer.astro` — desktop-only footer (`md:flex hidden`) showing app name and year; not rendered on mobile
  - `AppLogo.astro` — large brand mark used on auth pages only
- `src/components/hooks/` — extracted React hooks
- `src/lib/auth/signup-schema.ts` — shared Zod schema and constants (`SIGNUP_PASSWORD_MIN`, `SIGNUP_INVITE_CODE_MIN`) for signup validation; imported by the API route, `SignUpForm`, and unit tests
- `src/lib/` — Supabase client, utilities, services and business logic
- `src/layouts/` — page layouts
- `src/types.ts` — shared entity types and DTOs
- `supabase/` — database migrations and config
- `tests/unit/` — fast, dependency-free unit tests (no DB/network); run as part of `pnpm test`
- `tests/integration/` — Vitest tests that require a live Supabase project (needs `.env.test`)

## Architecture

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email,callback}.astro` — `/auth/callback` handles email confirmation (PKCE code exchange in the browser)
- Protected pages: `src/pages/dashboard.astro` and `src/pages/favorites.astro` — both include `DashboardTopbar`, `Footer` (desktop), and `BottomNav` (mobile). Dashboard mounts `DashboardShell` (`client:load`) with `PantryWidget` + `MealGenerator` displayed as card-based panels inside mobile tabs (Spiżarnia / Generator posiłków). Favourites mounts `FavoritesShell` with `FavoritesList`. Layout: @context/foundation/dashboard-layout.md

### Meal generation (client)

- `POST /api/generate` — server strict-pantry generation (F-02); see `src/lib/generation.ts`
- Client wire: `src/lib/generation-schema.ts`, `src/lib/parse-generate-response.ts`, `src/lib/generation-copy.ts` (Polish error copy)
- **`no_match` is HTTP 200** (`{ recipe: null, reason: "no_match" }`) — parse before treating as failure; UI uses info panel, not error styling

## Commands

- `pnpm run dev` — local dev server (Cloudflare workerd runtime)
- `pnpm run build` — production SSR build
- `pnpm run preview` — preview production build (local workerd/Miniflare)
- `pnpm run preview:wrangler` — build + run local workerd via wrangler dev
- `pnpm run deploy` — build + deploy to Cloudflare Workers
- `pnpm test` — Vitest integration/unit tests (requires `.env.test` — copy from `.env.test.example`; see @context/foundation/test-plan.md §6.2). CI runs the full suite in the `integration` job on same-repo PRs. **CRITICAL:** Only use the anon key. An environment guard inside `createClient()` will actively throw an error and abort execution if a `service_role` key is detected to prevent false-positive RLS bypasses.
- `pnpm test:e2e` — Playwright E2E on workerd preview (`build && preview` via `playwright.config.ts`; see @context/foundation/test-plan.md §6.3). Locally, align `.dev.vars` Supabase URL/key with the test project when running E2E. CI Tier 3 injects secrets as env vars; `scripts/ensure-dev-vars.mjs` materializes `.dev.vars` when missing so workerd preview can auth.
- `pnpm test:e2e:isolation` — fast local check that mutating E2E specs use unique pantry data and clean up after themselves: one build, reused preview, each mutating spec twice (~2 min). See `scripts/e2e-verify-isolation.mjs` and @tests/e2e/E2E-RULES.md. On Windows, prefer this over repeated full `test:e2e` runs (Playwright worker teardown can hang between projects).
- `pnpm run lint` — ESLint with strict type-checked rules
- `pnpm run lint:fix` — auto-fix lint issues
- `pnpm run format` — Prettier (includes astro + tailwindcss plugins)

Pre-commit hook (husky + lint-staged) runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Coding Style

- ESLint 9 flat config — see @eslint.config.js
- Prettier — see @.prettierrc.json
- Astro components for static content; React components only when interactivity is required
- API routes: uppercase `GET`/`POST` exports; validate input with zod
- Install new shadcn components via `npx shadcn@latest add [name]`

### Tailwind / design tokens

- Design tokens are OKLCH values defined in `src/styles/global.css` under `:root`. Use semantic token names (`text-primary`, `bg-card`, `border-border`, etc.) — never raw OKLCH values in component classes.
- **Segment buttons** (pill-shaped toggle groups, e.g. meal type, prep time) use a `data-active` attribute for active state styling: `data-[active=true]:bg-primary data-[active=true]:text-primary-foreground`. This is the established pattern — `data-active` is not a drift or error.
- Bottom padding on scrollable panels: use `pb-24 md:pb-4` so content stays clear of the fixed mobile bottom nav (`h-16`) on narrow screens and has normal spacing on desktop.

## Commit & PR Guidelines

- Conventional Commits: `type: description` (lowercase type, no scope required)

### CI (GitHub Actions)

Three tiers in @.github/workflows/ci.yml (triggers on push/PR to `main`):

| Tier | Job           | Runs on                        | What                                                                    |
| ---- | ------------- | ------------------------------ | ----------------------------------------------------------------------- |
| 1    | `ci`          | Every PR (including forks)     | lint, build, CI-safe Vitest (`assert-supabase-anon-key`, `placeholder`) |
| 2    | `integration` | Same-repo PRs + push to `main` | full `pnpm test` (RLS suite)                                            |
| 3    | `e2e`         | Same-repo PRs + push to `main` | Playwright on workerd preview                                           |

**Fork PRs:** Tier 1 only. Full test signal requires a same-repo PR or local `pnpm test && pnpm test:e2e`.

**GitHub secrets** (Tier 2 + 3): `SUPABASE_URL`, `SUPABASE_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` — use a **dedicated hosted CI/test Supabase project**, not production (see @.env.test.example).

**Whenever a new DB migration is added under `supabase/migrations/`, it must be manually applied to the hosted CI Supabase project before merging to `main`.** Tier 2/3 depend on schema parity.

**Future (out of scope):** optional pre-test `pnpm exec supabase db push --linked` in Tier 2/3 with `SUPABASE_ACCESS_TOKEN` + linked project.

#### AI Code Review

Separate workflow in @.github/workflows/review.yml — not part of the three CI tiers above.

| Field                       | Value                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Workflow                    | **AI Code Review**                                                                                               |
| Job                         | `review`                                                                                                         |
| Trigger                     | Same-repo PRs to `main` (open, sync, reopen, or `ai-cr:review` label); `workflow_dispatch`                       |
| Fork PRs                    | Skipped (no secrets on untrusted forks)                                                                          |
| Secret                      | `OPENROUTER_API_KEY`                                                                                             |
| Labels                      | `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` — create manually in GitHub UI before first run                   |
| Required check (after soak) | **AI Code Review / review**                                                                                      |
| Local equivalent            | `git diff main...HEAD \| pnpm --filter code-reviewer review` (optional: `PR_TITLE="feat: …"` for intent context) |

On each run the job posts or updates a PR comment with five stack-specific scores, applies pass/fail labels, and fails the check when the agent verdict is `fail`. Add `ai-cr:review` to trigger an on-demand re-run.

**Branch protection (after soak):** merge the workflow to `main`, verify on a test PR, then Settings → Branches → `main` → require status check **AI Code Review / review**. Run advisory-only first until the first successful soak, then enable as a merge gate.

**SHA-pinning policy:** pin every remote GitHub Action to a full commit SHA (`owner/repo@<40-char-sha> # vX` comment). Floating tags (`@v4`) can be retargeted without notice; actions run with access to secrets. Local composite actions (`./.github/actions/ai-reviewer`) run checked-out repo code — no remote SHA needed.

## Cloudflare

- Bump `compatibility_date` in `wrangler.jsonc` quarterly. Current: 2026-05-26.
- Always run `pnpm run build && pnpm run preview` before deploying to catch workerd-only failures.
- Never trust `astro dev` alone for runtime correctness — it runs on Node.js, not workerd.
- Production auto-deploys on push to `main` via Cloudflare Git integration.
- Manual deploy: `pnpm run deploy`.

## Environment

- Node version pinned in @.nvmrc
- Secrets: `SUPABASE_URL`, `SUPABASE_KEY` — copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev. **`SUPABASE_KEY` must be the anon key** — `createClient()` throws if the JWT decodes to `role: service_role` (see `src/lib/assert-supabase-anon-key.ts`).
- `SUPABASE_SERVICE_ROLE_KEY` — set in `.dev.vars` (local) and as a Cloudflare Worker secret (production). **Not** in `.env` and **not** in `astro:env/server` schema. Only `src/pages/api/auth/signup.ts` reads it, via `context.locals.runtime.env`.
- `INVITE_CODE` — set in `.dev.vars` / Cloudflare Worker secret. Controls who can register. No DB table required.
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored); include `OPENROUTER_API_KEY` for generation
- Email confirmation on `pnpm run preview` vs local Supabase: see README § Email confirmation on `pnpm run preview`
- Deploy: `pnpm run deploy`
