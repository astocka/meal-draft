# Pantry CRUD — Plan Brief

> Full plan: `context/changes/pantry-crud/plan.md`

## What & Why

S-02 adds full pantry management — add, view, edit, and remove products — embedded in the `/dashboard` page. This is the prerequisite for the north-star slice (S-03): US-01 requires at least one pantry product to exist before generation is meaningful. The dashboard is simultaneously redesigned from a placeholder stub into the application's home screen.

## Starting Point

`pantry_products` table is live (F-01) with RLS, unique name constraint, and a matching `PantryProduct` TypeScript type. `dashboard.astro` is a centered placeholder card with only a sign-out button. No JSON-returning API routes and no `.from()` Supabase queries exist yet in the codebase.

## Desired End State

A logged-in user sees a two-column app screen: pantry management on the left (fixed add input, scrollable alphabetical list, inline editing) and a meal generator placeholder on the right. All pantry changes appear immediately in the UI and persist across sessions. Sign-out is accessible from the top-right corner.

## Key Decisions Made

| Decision            | Choice                                                                  | Why (1 sentence)                                                                            | Source |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| Page structure      | Pantry embedded in `/dashboard`                                         | Dashboard becomes the app home rather than a dead-end stub                                  | Plan   |
| Edit UX             | Inline edit (click name → input)                                        | Fastest path for name-only edits; no modal overhead                                         | Plan   |
| Add/delete strategy | Fully optimistic                                                        | Satisfies "immediate UI updates" PRD requirement with near-zero perceived latency           | Plan   |
| Rename strategy     | Semi-optimistic (edit stays active during call)                         | Avoids the revert flash that full optimism causes on 409 duplicate errors                   | Plan   |
| Duplicate error     | Inline error below the relevant input                                   | Contextual; no toast library needed                                                         | Plan   |
| Sort order          | Alphabetical (A→Z)                                                      | Predictable scan pattern matching mental model of a fridge or cabinet                       | Plan   |
| Add input placement | Fixed zone at top, scrollable list below                                | Most-recently-added items are visible without scroll; consistent with task-list conventions | Plan   |
| Navigation          | Sign-out moves to top-right corner; two-column layout replaces the card | PRD US-05: user should land on pantry after login                                           | Plan   |

## Scope

**In scope:**

- `GET /api/pantry`, `POST /api/pantry`, `PATCH /api/pantry/[id]`, `DELETE /api/pantry/[id]`
- `PantryWidget` React island (optimistic CRUD, inline edit, empty state)
- Dashboard redesign: two-column layout, top bar with sign-out, server-rendered initial data
- `DashboardTopbar.astro` component (app-shell header; separate from `Topbar.astro` which is for pre-auth pages)
- `MealGeneratorPlaceholder` Astro component (right column stub)

**Out of scope:**

- Product quantity, expiry, or category (name-only v1)
- Separate `/pantry` route
- Service layer — Supabase calls live directly in API handlers
- Toast notifications — inline errors only
- Real `MealGenerator` component (S-03)

## Architecture / Approach

Dashboard server-fetches initial pantry items and passes them as props to `PantryWidget client:load` — no loading flash on first paint. All mutations go through the four JSON API endpoints; the widget manages local state optimistically. Duplicate-name errors map from Supabase `code: '23505'` to HTTP 409 and surface as inline error messages. This establishes the first JSON-response API route pattern in the codebase.

## Phases at a Glance

| Phase              | What it delivers                                      | Key risk                                                               |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. API endpoints   | Four JSON routes for list/add/rename/delete           | First `.from()` queries — verify RLS scoping works end-to-end          |
| 2. PantryWidget    | Full interactive CRUD island with optimistic state    | Optimistic insert + alphabetical sort must match server response order |
| 3. Dashboard shell | Two-column app home with server-rendered initial data | Dashboard redesign must keep `bg-cosmic` theme and responsive layout   |

**Prerequisites:** F-01 done (pantry table + RLS), S-01 done (auth flow + protected `/dashboard`)
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- Cloudflare Workers: JSON body parsing via `context.request.json()` must be confirmed to work in the workerd runtime (verify with `pnpm run preview` before considering done).
- `bg-cosmic` class behaviour at two-column scale — verify it doesn't clip or tile oddly when the dashboard covers the full viewport.

## Success Criteria (Summary)

- User can add "Flour", edit it to "Whole wheat flour", delete it, and sign out — all changes are immediate and survive a logout/login cycle.
- Duplicate item names are rejected with a clear inline message; the list is never left in an inconsistent state.
- The production build (`pnpm run build`) passes with zero lint or type errors.
