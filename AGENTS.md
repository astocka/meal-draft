# Repository Guidelines

MealDraft is an Astro 6 SSR application with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components, deployed to Cloudflare Workers.

## Hard Rules

- Never concatenate Tailwind class strings manually — use `cn()` from `@/lib/utils`.
- No Next.js directives (`"use client"`, `"use server"`). React islands use Astro `client:*` directives.
- API route files must export `const prerender = false`.
- Always enable RLS on new Supabase tables with granular per-operation, per-role policies.
- Name migrations `YYYYMMDDHHmmss_short_description.sql` in `supabase/migrations/`.

## Project Structure

- `src/pages/` — Astro routes and API endpoints (`api/auth/` for signin, signup, signout; `api/generate.ts` for meal generation)
- `src/components/` — Astro components at root; React islands in subdirs (`dashboard/`, `meal/`, `pantry/`); `ui/` for shadcn ("new-york" style): `button`, `tabs`, `card`
- `src/components/hooks/` — extracted React hooks
- `src/lib/` — Supabase client, utilities, services and business logic
- `src/layouts/` — page layouts
- `src/types.ts` — shared entity types and DTOs
- `supabase/` — database migrations and config

## Architecture

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email,callback}.astro` — `/auth/callback` handles email confirmation (PKCE code exchange in the browser)
- Protected page: `src/pages/dashboard.astro` — server-prefetches pantry; mounts `DashboardShell` (`client:load`) with `PantryWidget` + `MealGenerator`. Layout: @context/foundation/dashboard-layout.md

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
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored); include `OPENROUTER_API_KEY` for generation
- Email confirmation on `pnpm run preview` vs local Supabase: see README § Email confirmation on `pnpm run preview`
- Deploy: `pnpm run deploy`
