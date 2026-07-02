<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Meal Favorites Implementation Plan

- **Plan**: context/changes/meal-favorites/plan.md
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-06-05
- **Verdict**: APPROVED (post-triage, all findings fixed)
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Save button uses star icon instead of text label

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/meal/MealGenerator.tsx:281-298
- **Detail**: Plan specified a visible **Dodaj do ulubionych** text `Button` on the recipe card. Commit `a11719f` replaced it with a ghost star icon (`size="icon"`) using only `aria-label`. Behavior, copy constants, and status machine are intact; accessibility is preserved via aria-label but visible Polish label is gone.
- **Fix A ⭐ Recommended**: Document star-icon UX in plan as an addendum (commit `a11719f`).
  - Strength: Preserves shipped UX; updates source of truth for future reviews.
  - Tradeoff: Plan becomes a slightly moving target.
  - Confidence: HIGH — intent and acceptance criteria still met.
  - Blind spot: Stakeholders who reviewed original wireframe aren't notified.
- **Fix B**: Restore text button per original plan contract.
  - Strength: Strict plan adherence.
  - Tradeoff: Reverts intentional UX refinement.
  - Confidence: HIGH — straightforward revert.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — plan addendum added (a11719f star-icon UX)

### F2 — Unbounded recipe payload on POST

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/generation-schema.ts:10-15, src/pages/api/favorites/index.ts:55-62
- **Detail**: `mealRecipeSchema` has no `.max()` on `name`, `ingredients`, or `steps`. Unlike `pantryNameSchema` (max 100 chars), a client can POST arbitrarily large JSON and persist it in `recipe` JSONB. RLS limits abuse to the caller's own rows, but storage/DoS and large SSR payloads on `/favorites` remain possible.
- **Fix**: Add bounds aligned with generation output (e.g. `name.max(200)`, `ingredients.max(50)`, `steps.max(30)`, per-string `.max(500)`) in `mealRecipeSchema` or a dedicated `addFavoriteSchema` wrapper.
  - Strength: Matches pantry validation discipline; caps storage and response size.
  - Tradeoff: Must pick limits that don't reject legitimately generated recipes.
  - Confidence: HIGH — generation service already produces bounded output; limits can mirror it.
  - Blind spot: Haven't audited max actual generation output sizes.
- **Decision**: FIXED — added max bounds to mealRecipeSchema

### F3 — Save/generate race corrupts favorite UI state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/meal/MealGenerator.tsx:80-91, 142-169
- **Detail**: `handleGenerate` resets `saveStatus` and `isFavorited`, but an in-flight `handleSaveFavorite` can still complete afterward and call `setIsFavorited(true)` / `setSaveStatus("saved")` on the _new_ recipe. The star can show "saved" for a meal that was never favorited (DB state for the prior recipe may still be correct).
- **Fix**: Track a save generation token or use `AbortController`; ignore stale responses when `lastRecipe` has changed or generation has restarted.
  - Strength: Eliminates false-positive saved state without blocking generate.
  - Tradeoff: Small state-machine addition.
  - Confidence: HIGH — standard async stale-response guard.
  - Blind spot: None significant.
- **Decision**: FIXED — saveGenerationRef ignores stale save responses after generate

### F4 — Optimistic delete rollback and concurrent deletes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/favorites/FavoritesList.tsx:47-77, 131-140
- **Detail**: Rollback uses `removedIndex` captured at delete start; concurrent deletes can reinsert at wrong position or duplicate rows. Trash button has no in-flight guard — rapid clicks fire parallel DELETE requests. Same pattern exists in `PantryWidget.tsx`.
- **Fix**: Roll back by id (merge `removedItem` back into sorted list by id) and track `deletingIds` to disable the trash button while pending.
- **Decision**: FIXED — id-based rollback and deletingIds guard

### F5 — DELETE id param not validated as UUID

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/favorites/[id].ts:17-19
- **Detail**: `id` from `context.params` is passed straight to Supabase without UUID validation. Malformed ids may surface as PostgREST/DB errors → 500 instead of 400. Matches `pantry/[id].ts` pattern but is still a boundary weakness.
- **Fix**: Validate with `z.string().uuid()` before the query; return 400 for invalid ids.
- **Decision**: FIXED — UUID validation on DELETE id param

### F6 — Silent empty state when Supabase client unavailable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/favorites.astro:13-25
- **Detail**: Prefetch runs only when `supabase && user`. If `createClient()` returns null (misconfiguration), page renders `initialItems = []` with `loadError = false`, showing empty-state copy instead of error banner. Same as `dashboard.astro`.
- **Fix**: Set `loadError = true` when `user` exists but `supabase` is null.
- **Decision**: FIXED — loadError when supabase client unavailable

### F7 — Auto-dismiss save feedback (unplanned UX)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/meal/MealGenerator.tsx:70-78
- **Detail**: `useEffect` auto-dismisses success/duplicate messages after 3s (`SAVE_FEEDBACK_DISMISS_MS`). Not in plan but benign UX polish from `a11719f`.
- **Fix**: No action required; optionally note in plan addendum alongside F1.
- **Decision**: FIXED — already documented in F1 plan addendum (auto-dismiss after 3s)

## Automated Verification Results

| Command          | Result | Notes                             |
| ---------------- | ------ | --------------------------------- |
| `pnpm run lint`  | PASS   | Exit 0                            |
| `pnpm run build` | PASS   | Exit 0, server built successfully |

## Manual Verification (Progress section)

All 21 manual checkboxes marked `[x]` with commit SHAs (9b07f36, 8de88de, 20b0485). No evidence of rubber-stamping — implementation files match described behavior.

## Git Scope

Meal-favorites source commits: `9b07f36`, `8de88de`, `20b0485`, `a11719f`, `3841059`.

Changed source files (7):

- src/pages/api/favorites/index.ts
- src/pages/api/favorites/[id].ts
- src/components/meal/MealGenerator.tsx
- src/components/favorites/FavoritesList.tsx
- src/pages/favorites.astro
- src/components/dashboard/DashboardTopbar.astro
- src/middleware.ts

All planned files present in diff. No forbidden scope items (service layer, toasts, migration, edit API, search/filter).
