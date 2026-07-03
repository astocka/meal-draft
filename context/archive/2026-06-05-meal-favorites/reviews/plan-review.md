<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Meal Favorites Implementation Plan

- **Plan**: `context/changes/meal-favorites/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-05
- **Triage**: complete (2026-06-05)
- **Verdict**: SOUND (after triage — all findings fixed)
- **Findings**: 0 critical | 2 warnings (fixed) | 2 observations (fixed)

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 7/7 existing paths ✓, 4/4 new paths missing (expected) ✓, 6/6 symbols ✓, brief↔plan ✓

Existing paths verified: `src/pages/api/pantry/index.ts`, `src/pages/api/pantry/[id].ts`, `src/components/meal/MealGenerator.tsx`, `src/components/dashboard/DashboardTopbar.astro`, `src/middleware.ts`, `src/lib/generation-schema.ts`, `src/types.ts`.

Planned paths: `src/pages/api/favorites/index.ts` and `[id].ts` exist (pre-implement); `src/pages/favorites.astro` and `src/components/favorites/FavoritesList.tsx` not yet on disk.

## Findings

### F1 — DELETE 404 semantics diverge from pantry DELETE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Delete endpoint contract (`plan.md` line 85)
- **Detail**: Plan specifies DELETE `PGRST116` → 404 `{ error: 'not-found' }`. Pantry DELETE (`src/pages/api/pantry/[id].ts` lines 73–79) uses plain `.delete()` and always returns **204**, even when zero rows match — no `PGRST116` branch. That branch exists only on pantry PATCH (lines 51–52). Implementing favorites DELETE 404 likely requires `.delete().select().maybeSingle()` — extra complexity pantry delete avoided. Optimistic UI rollback on 404 vs silent 204 affects FavoritesList error handling.
- **Fix A ⭐ Recommended**: Align favorites DELETE with pantry — plain `.delete().eq('id', id).eq('user_id', user.id)` → 204 always; optimistic UI treats any 2xx as success.
  - Strength: Matches established pantry delete pattern and `PantryWidget` client handling (`res.ok` only).
  - Tradeoff: No explicit 404 for wrong id — idempotent delete semantics.
  - Confidence: HIGH — pantry shipped with this pattern; plan cites pantry as template.
  - Blind spot: None significant.
- **Fix B**: Keep 404 semantics but document `.delete().select('id').maybeSingle()` and error-code check; use kebab-case `not-found` consistently (pantry PATCH uses Title case `"Not found"`).
  - Strength: Stricter API contract; client can distinguish missing id from success.
  - Tradeoff: Diverges from pantry; more Supabase query surface.
  - Confidence: MED — works but untested in this codebase for DELETE.
  - Blind spot: workerd/PostgREST behavior for delete+select not verified in this repo.
- **Decision**: FIXED via Fix A — pantry-aligned DELETE 204 confirmed in plan.md

### F2 — POST body validation needs wrapper schema

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — List and add endpoint contract (`plan.md` line 77)
- **Detail**: Contract says validate POST body with `mealRecipeSchema`, but the wire shape is `{ recipe: MealRecipe }`. `mealRecipeSchema` alone validates the inner recipe object, not the envelope. Pantry uses `addSchema = z.object({ name: pantryNameSchema })` (`src/pages/api/pantry/index.ts` lines 9–11).
- **Fix**: Specify `addFavoriteSchema = z.object({ recipe: mealRecipeSchema })` in Phase 1 contract; `safeParse` on full body before insert.
- **Decision**: FIXED — addFavoriteSchema wrapper confirmed in plan.md

### F3 — Topbar nav placement underspecified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Topbar navigation (`plan.md` line 179)
- **Detail**: Plan says nav links go "left of sign-out." `DashboardTopbar.astro` uses `justify-between` with logo-only on the left and a right cluster (`email` + sign-out form, lines 5–21). Links belong in the right cluster, but order of `Dashboard | Ulubione` relative to email is unspecified.
- **Fix**: Add one line to contract: e.g. "Insert nav links in the right flex group before email: `Dashboard · Ulubione · {email} · Wyloguj`."
- **Decision**: FIXED — topbar nav order confirmed in plan.md

### F4 — Phase 2 save-button criterion uses imprecise "idle" wording

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Manual Verification (`plan.md` line 143)
- **Detail**: Criterion says save button hidden when "idle (no recipe)." After success, `status` is `"success"` (not `"idle"`) while `lastRecipe` is set — button should remain visible. Visibility is driven by `lastRecipe !== null`, not `status === 'idle'`.
- **Fix**: Reword criterion to "Save button hidden when `lastRecipe` is null (no recipe on screen)."
- **Decision**: FIXED — lastRecipe null wording confirmed in plan.md (Phase 2 + Progress 2.7)
