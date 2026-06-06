---

## starter_id: 10x-astro-starter
package_manager: pnpm
project_name: meal-draft
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false

## Why this stack

Solo developer building a meal-suggestion web app MVP in 3 weeks after hours, with auth and AI-powered meal generation as the technology-forcing features. The 10x Astro Starter is the recommended default for web apps in JS/TS and ships auth, PostgreSQL, and edge deploy via Supabase + Cloudflare Workers out of the box — no manual wiring needed for the core loop. It clears all four agent-friendly gates (typed via TypeScript + Zod, convention-based file routing, popular in training data, well-documented). Bootstrapper confidence is first-class, so scaffolding should be mostly smooth. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's standard shape.

## As built (foundations + north star done, 2026-06-06)

Snapshot of what the repo adds on top of the starter hand-off above (edit when a later slice changes it). Roadmap **F-01**, **F-02**, **S-01**, **S-02**, **S-03** are **done** — see @context/foundation/roadmap.md.

- **Data (F-01):** Supabase pantry, favorites, and generation-history tables with per-user RLS
- **Auth (S-01):** register, sign-in, sign-out, email confirmation; protected `/dashboard` and `/favorites`
- **Pantry (S-02):** CRUD API + `PantryWidget`; two-column dashboard shell
- **UI:** shadcn `button`, `tabs`, `card`; cosmic/purple tokens in `src/styles/global.css`; MVP copy in **Polish** (inline strings, no i18n)
- **Dashboard (S-03):** `DashboardShell` + `MealGenerator` + `PantryWidget` on `/dashboard` — layout @context/foundation/dashboard-layout.md
- **AI (F-02):** OpenRouter via `src/lib/generation.ts`; `POST /api/generate`; client Zod wire in `generation-schema.ts` + `parse-generate-response.ts`
- **Verify generation on workerd:** `pnpm run build && pnpm run preview` (not `astro dev` alone)