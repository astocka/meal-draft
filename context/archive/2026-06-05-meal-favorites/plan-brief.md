# Meal Favorites — Plan Brief

> Full plan: `context/changes/meal-favorites/plan.md`

## What & Why

Users need to bookmark meals they liked during generation and find them again later. S-05 delivers save-to-favorites from the generator, a browsable favorites list reachable from main navigation, and graceful duplicate handling — turning intentional bookmarks into a persistent, private collection separate from generation history.

## Starting Point

F-01 created the `favorite_meals` table with RLS, recipe JSONB CHECK, and a per-user unique dish-name index. S-03 ships `MealGenerator` with `lastRecipe` state after generation. Pantry CRUD established the API and optimistic-UI patterns. No favorites API, UI, page, or navigation exists yet.

## Desired End State

A logged-in user taps **Dodaj do ulubionych** on a generated recipe, sees brief confirmation (or duplicate info), then opens **Ulubione** from the top bar to browse saved meals (newest first), expand full recipes, and delete unwanted entries. Favorites persist across sessions and remain account-private.

## Key Decisions Made

| Decision       | Choice                                     | Why (1 sentence)                                                        | Source |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| Navigation     | Separate `/favorites` page + topbar link   | Satisfies FR-012 without crowding the two-column dashboard shell        | Plan   |
| Duplicate save | HTTP 409 → inline info message             | Matches pantry duplicate UX; not alarm-styled                           | Plan   |
| Pantry drift   | Show recipe snapshot as-is                 | F-01 snapshot design; read-only bookmarks need no pantry coupling in v1 | Plan   |
| Delete         | Trash icon per item (pantry pattern)       | Users must curate favorites; RLS already allows DELETE                  | Plan   |
| List display   | Compact row + expand for full recipe       | Scannable list with full recipe on demand per US-03                     | Plan   |
| Sort order     | `saved_at` descending                      | Most recent bookmarks surface first                                     | Plan   |
| Save button    | Spinner during POST, then re-enabled       | Clear async feedback; duplicate path stays obvious                      | Plan   |
| Out of scope   | No re-generate, pantry check, edit, search | Thin v1 slice per PRD Socrates resolutions and RLS constraints          | Plan   |

## Scope

**In scope:** Favorites API (GET/POST/DELETE), save button on `MealGenerator`, `/favorites` page with server prefetch, `FavoritesList` island, topbar nav, middleware guard, Polish inline copy.

**Out of scope:** Cook-again flow, pantry ingredient validation, edit/rename favorites, search/filter, toasts, service layer, DB migration.

## Architecture / Approach

Three layers following pantry-crud: API routes validate `MealRecipe` via existing Zod schema and map `23505` to 409; `MealGenerator` POSTs the displayed recipe snapshot; `favorites.astro` server-prefetches rows and mounts `FavoritesList` with optimistic delete. `DashboardTopbar` gains Dashboard + Ulubione links; middleware protects `/favorites`.

## Phases at a Glance

| Phase                | What it delivers                                         | Key risk                                         |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| 1. Favorites API     | GET/POST/DELETE endpoints with auth + duplicate handling | Recipe Zod vs DB CHECK mismatch on edge shapes   |
| 2. Save in Generator | Dodaj do ulubionych button + inline Polish feedback      | Stale save message if not cleared on re-generate |
| 3. Page + Navigation | `/favorites`, expandable list, topbar, middleware        | Mobile nav + expanded recipe readability         |

**Prerequisites:** S-03 done; F-01 schema applied locally/remotely.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Duplicate detection is by normalized dish **name**, not full recipe body — same-name different recipes collide (by F-01 design).
- Favorites list is unbounded in v1 — acceptable for MVP volumes; pagination deferred.
- workerd runtime must be verified via `build && preview` per AGENTS.md — not `astro dev` alone.

## Success Criteria (Summary)

- User saves a generated meal and finds it on `/favorites` with full recipe details.
- Duplicate save shows info copy, not an error.
- User deletes a favorite and it stays gone after refresh.
- Favorites accessible from topbar navigation while signed in.
