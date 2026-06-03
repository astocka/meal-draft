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
- CI gate (see @.github/workflows/ci.yml): lint + build must pass on every push/PR to `main`
- No test suite configured yet — CI does not run tests

## Cloudflare

- Bump `compatibility_date` in `wrangler.jsonc` quarterly. Current: 2026-05-26.
- Always run `pnpm run build && pnpm run preview` before deploying to catch workerd-only failures.
- Never trust `astro dev` alone for runtime correctness — it runs on Node.js, not workerd.
- Production auto-deploys on push to `main` via Cloudflare Git integration.
- Manual deploy: `pnpm run deploy`.

## Environment

- Node version pinned in @.nvmrc
- Secrets: `SUPABASE_URL`, `SUPABASE_KEY` — copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored); include `OPENROUTER_API_KEY` for generation
- Email confirmation on `pnpm run preview` vs local Supabase: see README § Email confirmation on `pnpm run preview`
- Deploy: `pnpm run deploy`

