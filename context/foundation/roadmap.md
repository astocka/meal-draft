---
project: MealDraft
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-03
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: MealDraft

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Busy working adults waste time and food every day because opening the fridge triggers decision paralysis, a skill gap, and slow waste as ingredients expire. Existing recipe apps return lists of options and treat constraints as suggestions — MealDraft gives exactly one answer at a time that respects pantry contents, time budget, and meal type as non-negotiable filters, with "Try another" excluding past results.

## North star

**S-03: user can generate exactly one strict-pantry meal from their pantry and constraints** — this is the validation milestone (the smallest end-to-end flow that proves the core product hypothesis): if a logged-in user cannot go from pantry → constraints → one compliant meal suggestion, nothing else in the product matters.

> **North star** here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as prerequisites allow because everything else only matters if this works.
>
> **Delivered 2026-06-03 (S-03).** Validation focus moves to S-04 (Try another) and parallel favorites/history slices.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | domain-data-schema | (foundation) pantry, favorites, and generation-history tables exist with per-user RLS | — | NFR (privacy), Access Control | done |
| F-02 | ai-meal-generation | (foundation) server-side meal generation returns one strict-pantry recipe from pantry + constraints | F-01 | NFR (feedback >1s), Business Logic | done |
| S-01 | auth-flow-for-mvp | register, log in, log out, and reach a protected core screen after authentication | — | US-05, FR-001, FR-002 | done |
| S-02 | pantry-crud | add, view, edit, and remove pantry products with immediate UI updates and session persistence | F-01, S-01 | US-02, FR-003, FR-004, FR-005, FR-006 | done |
| S-03 | strict-pantry-meal-generation | set time and meal-type constraints, tap Generate, and see exactly one compliant meal suggestion | F-01, F-02, S-02 | US-01, FR-007, FR-008, FR-009 | done |
| S-04 | try-another-suggestion | tap Try another for a different non-repeating suggestion within the same session, with exhaustion messaging | S-03 | US-06, FR-010 | proposed |
| S-05 | meal-favorites | save a generated meal to favorites and browse the favorites list from navigation | S-03 | US-03, FR-011, FR-012 | proposed |
| S-06 | generation-history | browse the last N generated meals in reverse chronological order | S-03 | US-04, FR-013 | proposed |

**Unlocked now** (prerequisites met): **S-04**, **S-05**, **S-06**. **Current focus:** S-04 (Try another) or parallel thin favorites/history once planned. **North star (S-03) shipped** 2026-06-03.

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Schema & pantry | `F-01` → `S-02` | **S-02 done**; joins Stream C at `S-02` (needs `S-01`). |
| B | Generation loop | `F-02` → `S-03` (done) → `S-04` / `S-05` / `S-06` | North star shipped; speed bias keeps `S-04` before favorites/history. |
| C | Account access | `S-01` | Auth scaffold present in baseline; slice completes MVP auth UX. Joins Stream A at `S-02`. |

## Baseline

What's already in place in the codebase as of `2026-06-03` (auto-researched + slice completions).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, file routing (`src/pages/`); shadcn `button`, `tabs`, `card`; `DashboardShell` + `MealGenerator` on `/dashboard` (mobile tabs per @context/foundation/dashboard-layout.md)
- **Backend / API:** partial — Astro SSR on Cloudflare; auth API routes (`src/pages/api/auth/`); pantry CRUD; `POST /api/generate` with client wire (`generation-schema`, `parse-generate-response`, `generation-copy`) (F-02, S-02, S-03)
- **Data:** partial — Supabase client wired (`src/lib/supabase.ts`); pantry, favorites, and generation-history tables with per-user RLS (F-01)
- **Auth:** present (MVP complete, S-01) — register, sign-in, sign-out, email confirmation, protected routes beyond `/dashboard` only
- **Deploy / infra:** present (partial CI) — Cloudflare Workers (`wrangler.jsonc`); GitHub Actions lint + build; no deploy workflow in repo
- **Observability:** absent — no app-level logging or error tracking; Cloudflare platform observability only

## Foundations

### F-01: Domain data schema

- **Outcome:** (foundation) pantry, favorites, and generation-history tables exist with per-user row-level security enforcing account-private data.
- **Change ID:** domain-data-schema
- **PRD refs:** Access Control, NFR (pantry/favorites/history private to account)
- **Unlocks:** S-02, S-05, S-06; privacy verification path for all user-data slices
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every vertical slice depends on persisted user data; without RLS the privacy NFR cannot be met.
- **Status:** done

### F-02: AI meal generation integration

- **Outcome:** (foundation) a server-side generation path accepts pantry ingredients + constraints and returns one structured meal (name, time, ingredients, steps) with strict-pantry validation.
- **Change ID:** ai-meal-generation
- **PRD refs:** Business Logic, NFR (visible feedback during operations >1s)
- **Unlocks:** S-03, S-04
- **Prerequisites:** F-01
- **Parallel with:** S-02 (after F-01 lands)
- **Blockers:** —
- **Unknowns:**
  - Which LLM provider and model for v1? — Owner: user. Block: no.
- **Risk:** Sequenced before the north-star slice because generation quality and strict-pantry compliance are the product's riskiest assumption; surfacing failures early beats polishing pantry UI first.
- **Status:** done

## Slices

### S-01: Auth flow for MVP

- **Outcome:** user can register with email and password, log in, log out, and reach a protected core screen; unauthenticated access to protected routes redirects to login.
- **Change ID:** auth-flow-for-mvp
- **PRD refs:** US-05, FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth scaffold exists but only `/dashboard` is protected; this slice expands route guards and post-login landing before pantry work ships to real users.
- **Status:** done

### S-02: Pantry CRUD

- **Outcome:** user can add, view, edit, and remove pantry products with immediate UI updates; pantry state persists across sessions.
- **Change ID:** pantry-crud
- **PRD refs:** US-02, FR-003, FR-004, FR-005, FR-006
- **Prerequisites:** F-01, S-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced immediately before the north star because US-01 requires at least one pantry product; manual entry is acceptable for v1 per PRD.
- **Status:** done

### S-03: Strict-pantry meal generation

- **Outcome:** user can set a time budget and meal type, tap Generate, and see exactly one meal suggestion using only declared pantry ingredients, respecting all constraints, with a clear message when no valid meal exists.
- **Change ID:** strict-pantry-meal-generation
- **PRD refs:** US-01, FR-007, FR-008, FR-009
- **Prerequisites:** F-01, F-02, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **UX (mobile):** Tab navigation (*Spiżarnia* | *Generator posiłków*) on viewports &lt; 768px — shipped in `DashboardShell`; see @context/foundation/dashboard-layout.md.
- **Risk:** This is the north star — the validation milestone that proves MealDraft is not another recipe list app; strict-pantry zero-tolerance is the hardest contract to satisfy.
- **Status:** done

### S-04: Try another suggestion

- **Outcome:** user can tap Try another for a different non-repeating suggestion within the same session, see the pool shrinking, and get helpful exhaustion messaging when no options remain.
- **Change ID:** try-another-suggestion
- **PRD refs:** US-06, FR-010
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced immediately after the north star because the Secondary Success Criterion depends on session-scoped exclusion working reliably.
- **Status:** proposed

### S-05: Meal favorites

- **Outcome:** user can save a generated meal to favorites and browse their favorites list from main navigation; duplicate saves are handled gracefully.
- **Change ID:** meal-favorites
- **PRD refs:** US-03, FR-011, FR-012
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:**
  - What happens when a user removes a favorited meal's ingredients from pantry? — Owner: user. Block: no.
- **Risk:** In scope for v1 — sequenced after the core generation loop (not cut). Favorites persist indefinitely; history (S-06) is a capped passive log. Build thin versions of both in parallel once S-03 lands.
- **Status:** proposed

### S-06: Generation history

- **Outcome:** user can browse their last N generated meals in reverse chronological order (read-only, showing dish name, date, and meal type).
- **Change ID:** generation-history
- **PRD refs:** US-04, FR-013
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - What is the specific value of N for generation history limit? — Owner: user. Block: no.
- **Risk:** Parallel with favorites after north star; N can be decided during implementation but affects UX expectations.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | domain-data-schema | Add pantry, favorites, and history schema with RLS | no | Done — see ## Done |
| F-02 | ai-meal-generation | Integrate server-side strict-pantry meal generation | no | Done — see ## Done |
| S-01 | auth-flow-for-mvp | Complete MVP auth flow and route protection | no | Done — see ## Done |
| S-02 | pantry-crud | Build pantry add/view/edit/remove UI and API | no | Done — see ## Done |
| S-03 | strict-pantry-meal-generation | Ship first strict-pantry meal generation (north star) | no | Done — see ## Done |
| S-04 | try-another-suggestion | Add Try another with session exclusion | yes | **Next up** — run `/10x-new try-another-suggestion` when starting |
| S-05 | meal-favorites | Add save-to-favorites and favorites list | yes | Unlocked — can plan in parallel with S-04 |
| S-06 | generation-history | Add read-only generation history (last N) | yes | Unlocked — can plan in parallel with S-04 |

## Open Roadmap Questions

1. **What is the specific value of N for generation history limit?** — Owner: user. Block: S-06 (planning only; implementation can proceed with a default).
2. **What are the exact time budget presets?** — Resolved in S-03: **15 / 30 / 60** min + **Dowolny czas** (default `null`).
3. **What happens when a user removes a favorited meal's ingredients from pantry?** — Owner: user. Block: S-05 (planning only).

## Parked

- **No weekly meal planning or diet scheduling** — Why parked: PRD §Non-Goals; triples scope and blurs product identity.
- **No calorie counting, macros, or dietetics module** — Why parked: PRD §Non-Goals; decision engine, not health tracker.
- **No grocery store integration or auto-generated shopping lists** — Why parked: PRD §Non-Goals; v2 after core loop proven.
- **No automatic pantry deduction after cooking** — Why parked: PRD §Non-Goals; user manually manages pantry in v1.
- **No dedicated mobile app** — Why parked: PRD §Non-Goals; responsive web only for v1.
- **No social features** — Why parked: PRD §Non-Goals; personal tool in v1.
- **No offline-first guarantee** — Why parked: PRD §Non-Goals; generation requires external AI service.
- **Anonymous trial before registration** — Why parked: PRD FR-001 Socrates resolution; auth-first is simpler for v1 under time pressure.
- **OAuth / passwordless login** — Why parked: PRD FR-002 Socrates resolution; email + password sufficient for v1.
- **Barcode / voice pantry input** — Why parked: PRD FR-003 Socrates resolution; manual entry simplest for v1.
- **App-level observability stack** — Why parked: speed bias + NFR best-effort availability; Cloudflare platform observability sufficient for v1.

## Done

- **F-01** domain-data-schema — pantry, favorites, and generation-history tables with per-user RLS (2026-05-29)
- **S-01** auth-flow-for-mvp — register, sign-in, sign-out, protected routes, email confirmation callback (2026-05-30)
- **S-02** pantry-crud — add, view, edit, and remove pantry products with immediate UI updates and session persistence (2026-05-31)
- **F-02** ai-meal-generation — `POST /api/generate` + `src/lib/generation.ts` strict-pantry generation via OpenRouter (2026-06-02)
- **S-03** strict-pantry-meal-generation — `MealGenerator` + `DashboardShell` (mobile tabs), Zod wire parser, `loadError`, Polish UX, workerd verification (2026-06-03)
