# Meal Favorites Implementation Plan

## Overview

Ship S-05: users can save a generated meal to favorites from `MealGenerator`, browse their favorites on a dedicated `/favorites` page, and reach that page from main navigation in `DashboardTopbar`. Duplicate saves surface as Polish info copy (HTTP 409). Favorites store independent recipe snapshots — no pantry cross-check, no edit, no re-generate.

## Current State Analysis

- `favorite_meals` table is live with `id`, `user_id`, `recipe` (JSONB), `saved_at`; CHECK constraint enforces `MealRecipe` shape; unique index on `(user_id, lower(trim(recipe->>'name')))` prevents duplicate dish names per user; RLS covers SELECT/INSERT/DELETE for `authenticated` — F-01 complete (`supabase/migrations/20260528120000_domain_data_schema.sql` lines 41–59, 139–155).
- `FavoriteMeal` and `MealRecipe` types exist in `src/types.ts` (lines 3–23); `mealRecipeSchema` in `src/lib/generation-schema.ts` (lines 10–15) mirrors the DB CHECK and generation wire format.
- `MealGenerator` holds `lastRecipe` after successful generation (`src/components/meal/MealGenerator.tsx` lines 52–53, 99–101) and renders the recipe `Card` (lines 227–251) — natural save-button insertion point.
- Pantry CRUD established the API pattern: `prerender = false`, `context.locals.user` null-check → 401, `createClient()`, Zod validation, `23505` → 409 (`src/pages/api/pantry/index.ts`).
- `DashboardTopbar.astro` has logo + sign-out only — no main navigation links yet (lines 5–22).
- `PROTECTED_ROUTES` in `src/middleware.ts` lists only `/dashboard` (line 6) — `/favorites` must be added.
- No favorites API routes, React components, or pages exist under `src/`.

## Desired End State

After this plan completes:

1. A logged-in user generates a meal on `/dashboard`, sees **Dodaj do ulubionych** on the recipe card, taps it, and gets brief success confirmation (or info message if already saved).
2. The user clicks **Ulubione** in the top bar and lands on `/favorites` with their saved meals listed most-recent-first.
3. Each list item shows dish name + saved date; expanding reveals full recipe (ingredients + steps) matching the generator card structure.
4. The user can delete a favorite via trash icon; the item disappears immediately and persists across sessions.
5. Favorites survive logout/login and remain private to the account (RLS).
6. Empty favorites shows a friendly Polish prompt.

### Key Discoveries

- Favorites are recipe snapshots — `recipe` JSONB is independent of `generation_history` and current pantry (`context/changes/domain-data-schema/plan.md` lines 81–87).
- Duplicate detection is DB-enforced by normalized dish name, not recipe body hash — two different recipes with the same name cannot both be favorited.
- No UPDATE RLS policy on `favorite_meals` — favorites are immutable after save; curation is delete + re-save only.
- Server prefetch pattern from `dashboard.astro` (pantry list) applies to `favorites.astro` — instant paint, no client mount fetch.
- PRD US-03 requires full recipe details in favorites; US-03/FR-012 require main-navigation access.

## What We're NOT Doing

- No "cook again" / re-generate from a favorite (PRD Socrates resolution).
- No pantry ingredient validation, missing-ingredient badges, or warnings on favorites view.
- No edit/rename of saved favorites (no UPDATE API; RLS has no UPDATE policy).
- No search or filter on the favorites list.
- No service layer (`src/lib/favorites.ts`) — Supabase calls live in API route handlers, consistent with pantry.
- No toast library — success, duplicate, and error feedback are inline only.
- No migration — schema and RLS are complete from F-01.
- No generation-history integration — `historyId` from generate is not required to save a favorite.

## Implementation Approach

Three phases in dependency order:

1. **API layer** — GET/POST list+add and DELETE by id; testable via `curl` before UI exists.
2. **Save action** — wire `MealGenerator` to POST; loading spinner + inline Polish copy.
3. **Favorites page + navigation** — server-prefetched `/favorites` page, `FavoritesList` island, topbar links, middleware guard.

## Critical Implementation Details

**Duplicate dish name:** Map Supabase `PostgrestError.code === '23505'` to HTTP 409 with `{ error: 'already-favorited' }` — mirror pantry's `already-in-pantry` pattern. UI treats 409 as info styling (not destructive error), per pantry duplicate UX.

**Save state reset on new generation:** `handleGenerate` clears `lastRecipe` at start (line 69) — any save confirmation message in `MealGenerator` must also clear when a new generation begins, so stale success text does not linger.

---

## Phase 1: Favorites API Endpoints

### Overview

Create JSON API endpoints for listing, adding, and deleting favorites. First favorites-facing routes in the codebase; follow pantry auth and error conventions.

### Changes Required:

#### 1. List and add endpoint

**File**: `src/pages/api/favorites/index.ts`

**Intent**: Provide authenticated list (ordered `saved_at DESC`) and insert of a recipe snapshot.

**Contract**: `export const prerender = false`. `GET` → 200 `{ items: FavoriteMeal[] }` ordered by `saved_at` descending. `POST` body `{ recipe: MealRecipe }` validated with `addFavoriteSchema = z.object({ recipe: mealRecipeSchema })` from `@/lib/generation-schema`; insert `{ user_id, recipe }`; 201 `{ item: FavoriteMeal }`. Auth: `context.locals.user` → 401; `createClient()` null → 503. Invalid JSON → 400 `{ error: "Invalid JSON body" }`. Insert `23505` → 409 `{ error: 'already-favorited' }`. Other DB errors → 500.

#### 2. Delete endpoint

**File**: `src/pages/api/favorites/[id].ts`

**Intent**: Allow users to remove a favorite they no longer want.

**Contract**: `DELETE` with `id` param; plain `.delete().eq('id', id).eq('user_id', user.id)` → **204** always on success (matches pantry DELETE — idempotent when row missing). DB errors → 500.

### Success Criteria:

#### Automated Verification:

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification:

- `GET /api/favorites` returns `{ items: [] }` when empty (authenticated session)
- `POST /api/favorites` with valid `MealRecipe` returns 201 and item appears in subsequent GET
- Duplicate POST with same `recipe.name` (case/whitespace variants) returns 409 `already-favorited`
- `DELETE /api/favorites/:id` returns 204; subsequent GET omits the item
- Unauthenticated requests return 401

**Implementation Note**: After automated verification passes, pause for manual API smoke test before Phase 2.

---

## Phase 2: Save Action in MealGenerator

### Overview

Add **Dodaj do ulubionych** to the recipe card shown after successful generation. Async save with loading spinner; inline success and duplicate-info copy.

### Changes Required:

#### 1. Save handler and UI on recipe card

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Let users bookmark the currently displayed generated meal without leaving the generator.

**Contract**: Render save `Button` inside or below the recipe `Card` when `lastRecipe` is set (after line 251). Local state: `saveStatus: 'idle' | 'saving' | 'saved' | 'duplicate' | 'error'` (or equivalent). On click: `POST /api/favorites` with `{ recipe: lastRecipe }`. During request: button shows `Loader2` spinner, disabled. On 201: brief inline success text (e.g. "Dodano do ulubionych"); button returns to enabled **Dodaj do ulubionych**. On 409: info-styled inline text (e.g. "Ten posiłek jest już w ulubionych") — not `role="alert"` error styling. On other failures: error-styled inline message. Clear save feedback when `handleGenerate` starts (alongside existing state resets at lines 66–70).

#### 2. Polish copy constants

**File**: `src/components/meal/MealGenerator.tsx` (or colocated constants)

**Intent**: Keep MVP copy inline in Polish per PRD; no i18n layer.

**Contract**: Named constants for save button label, success message, duplicate message, and generic save error — same pattern as `NO_MATCH_TITLE`, `LOAD_ERROR_MESSAGE` at file top.

### Success Criteria:

#### Automated Verification:

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification:

- After successful generation, save button is visible on recipe card
- Click save → spinner → success message; favorite appears via API/DB
- Save same meal again → info message (not red error)
- Start new generation → previous save message clears
- Save button hidden when `lastRecipe` is null (no recipe on screen)

**Implementation Note**: Pause for manual save-flow sign-off before Phase 3.

---

## Phase 3: Favorites Page and Navigation

### Overview

Dedicated `/favorites` page with server-prefetched list, expandable recipe rows, optimistic delete, and topbar navigation link. Extend route protection.

### Changes Required:

#### 1. Favorites list React island

**File**: `src/components/favorites/FavoritesList.tsx`

**Intent**: Browse and manage favorites with the same visual language as pantry and generator cards.

**Contract**: Props: `initialItems: FavoriteMeal[]`, optional `loadError: boolean`. Initialize state from `initialItems` (no mount fetch). Sort display by `saved_at` descending (should match API order). Each row: dish name (`recipe.name`), formatted saved date, expand toggle revealing ingredients + steps (mirror `MealGenerator` card content). Trash icon per row: optimistic remove, `DELETE /api/favorites/:id`, re-insert on failure with inline error. Empty state: friendly Polish prompt (e.g. "Nie masz jeszcze ulubionych posiłków"). `loadError` banner when server prefetch failed. Use `cn()`, shadcn `Button`/`Card`, lucide icons — no manual Tailwind string concat.

#### 2. Favorites page

**File**: `src/pages/favorites.astro`

**Intent**: Protected page that server-prefetches favorites and mounts the list island.

**Contract**: Mirror `dashboard.astro` structure: `Layout`, `DashboardTopbar`, `bg-cosmic` shell. If `supabase && user`: `from('favorite_meals').select('*').eq('user_id', user.id).order('saved_at', { ascending: false })`. Pass `initialItems` and `loadError` to `<FavoritesList client:load />`. Page title in Polish (e.g. "Ulubione — MealDraft").

#### 3. Topbar navigation

**File**: `src/components/dashboard/DashboardTopbar.astro`

**Intent**: Satisfy FR-012 — favorites accessible from main navigation on app pages.

**Contract**: Insert nav links in the right flex group before email: **Dashboard** (`/dashboard`) · **Ulubione** (`/favorites`) · `{email}` · **Wyloguj**. Highlight or style current route if straightforward via `Astro.url.pathname`; otherwise plain links. Keep logo on the left. Links visible on both dashboard and favorites pages (shared topbar).

#### 4. Middleware route guard

**File**: `src/middleware.ts`

**Intent**: Redirect unauthenticated users away from `/favorites`.

**Contract**: Add `"/favorites"` to `PROTECTED_ROUTES` array.

### Success Criteria:

#### Automated Verification:

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification:

- Signed-in user sees **Ulubione** in topbar on `/dashboard` and `/favorites`
- `/favorites` lists saved meals most-recent-first with expandable full recipe
- Delete removes item optimistically and persists after refresh
- Empty state shows when no favorites
- Unauthenticated `/favorites` redirects to `/auth/signin`
- `pnpm run build && pnpm run preview` — full flow works on workerd (save on dashboard → browse on favorites → delete)
- Mobile: nav links usable; expanded recipe readable on narrow viewport

**Implementation Note**: Pause for end-to-end manual sign-off before marking slice complete.

---

## Testing Strategy

### Unit Tests

- None configured in repo. Zod validation and API behavior verified manually.

### Integration Tests

- Deferred to post-MVP E2E.

### Manual Testing Steps

1. Sign in → generate meal → save → confirm success message.
2. Save same meal again → confirm duplicate info (not error styling).
3. Navigate to **Ulubione** → confirm meal listed with correct name and date.
4. Expand row → confirm ingredients and steps match generator card.
5. Delete favorite → confirm optimistic removal and persistence after refresh.
6. Log out → log in → confirm favorites intact.
7. Visit `/favorites` logged out → redirect to sign-in.
8. Empty favorites → confirm empty-state copy.
9. `pnpm run build && pnpm run preview` on workerd — repeat steps 1–5.

## Performance Considerations

- Favorites lists are unbounded in v1 (no pagination) — acceptable for MVP side-project volumes per PRD speed bias.
- Server prefetch avoids client waterfall on page load.
- Expandable rows keep initial DOM light for users with many favorites.

## Migration Notes

- No database migration required. F-01 schema is authoritative.
- If local Supabase is used, ensure migration `20260528120000_domain_data_schema.sql` has been applied.

## References

- Roadmap S-05: `context/foundation/roadmap.md` lines 147–158
- PRD US-03, FR-011, FR-012: `context/foundation/prd.md` lines 78–88, 160–163
- Schema plan: `context/changes/domain-data-schema/plan.md` lines 81–87
- Pantry API pattern: `src/pages/api/pantry/index.ts`
- Generator hook point: `src/components/meal/MealGenerator.tsx` lines 227–251
- Recipe schema: `src/lib/generation-schema.ts` lines 10–15

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Favorites API Endpoints

#### Automated

- [ ] 1.1 Linting passes: `pnpm run lint`
- [ ] 1.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 1.3 GET /api/favorites returns empty list when authenticated with no favorites
- [ ] 1.4 POST with valid recipe returns 201; GET includes new item
- [ ] 1.5 Duplicate POST returns 409 already-favorited
- [ ] 1.6 DELETE returns 204; item removed from GET
- [ ] 1.7 Unauthenticated requests return 401

### Phase 2: Save Action in MealGenerator

#### Automated

- [ ] 2.1 Linting passes: `pnpm run lint`
- [ ] 2.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 2.3 Save button visible on recipe card after successful generation
- [ ] 2.4 Save shows spinner then success message; favorite persisted
- [ ] 2.5 Duplicate save shows info message (not error styling)
- [ ] 2.6 Save feedback clears on new generation
- [ ] 2.7 Save button hidden when lastRecipe is null

### Phase 3: Favorites Page and Navigation

#### Automated

- [ ] 3.1 Linting passes: `pnpm run lint`
- [ ] 3.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 3.3 Ulubione link visible in topbar on dashboard and favorites pages
- [ ] 3.4 Favorites list shows items saved_at DESC with expandable recipe
- [ ] 3.5 Delete works optimistically and persists after refresh
- [ ] 3.6 Empty state displays when no favorites
- [ ] 3.7 Unauthenticated /favorites redirects to sign-in
- [ ] 3.8 workerd preview: end-to-end save → browse → delete flow
- [ ] 3.9 Mobile layout: nav and expanded recipe usable
