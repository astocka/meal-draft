# Diet Type Filter — Implementation Plan

## Overview

Add a diet-type filter to the meal generator: users select from 6 options (none, vegetarian, vegan, gluten-free, lactose-free, anti-inflammatory) before generating a meal. The selection is enforced in the LLM system prompt, persisted to `generation_history` in the DB, and remembered in localStorage across sessions.

## Current State Analysis

The generator today accepts two constraints: `meal_type` (breakfast/lunch/dinner) and `max_prep_time_minutes` (15/30/60/null). Both follow a shared pattern:

1. `src/types.ts` defines the type; `GenerateRequest` carries it
2. `src/lib/generation-schema.ts` validates it via Zod
3. `src/lib/generation.ts` injects it into `buildSystemPrompt`
4. `src/pages/api/generate.ts` validates via Zod then passes `parsed.data` directly to `generateMeal`
5. `src/components/meal/MealGenerator.tsx` renders segment buttons using `data-[active=true]` from the constants in `src/lib/meal-types.ts`

There is no diet concept anywhere in the codebase today.

**COOKING_STAPLES conflicts (key discovery):** Four staples conflict with specific diets:

- `masło` (butter) — animal-derived → must be excluded for `vegan` and `lactose_free`
- `mąka` (plain flour) — defaults to wheat in Polish cooking → must be excluded for `gluten_free`
- `mąka pszenna` (wheat flour) — contains gluten → must be excluded for `gluten_free`
- `mąka uniwersalna` (all-purpose flour) — contains gluten → must be excluded for `gluten_free`
- `mąka kukurydziana` (corn flour) — gluten-free → safe to keep for `gluten_free`

`generation_history` currently stores `{user_id, name, meal_type, recipe, generated_at}` — no `diet_type` column.

No unit tests exist for `buildSystemPrompt` or any staples logic.

## Desired End State

- User can select a diet type from a 6-option pill-button row in the generator
- Selected diet persists in localStorage (`mealdraft:diet_type`) across sessions
- Changing diet type clears the try-another exclusion list
- LLM system prompt includes an English diet constraint line for all non-default diet types
- `filterStaplesForDiet` removes conflicting staples from the allowed list before injecting into the prompt
- `generation_history.diet_type` stores the diet used on every generation (including failure sentinel rows)
- No-match and exhaustion panels show a "Zmień typ diety" hint when diet ≠ `none`
- Unit tests cover all 6 diet types for both prompt output and staples filtering

### Key Discoveries

- `src/lib/meal-types.ts:3-7` — exact pattern to replicate for diet type UI options
- `src/lib/generation.ts:56` — `buildSystemPrompt` signature to extend
- `src/lib/generation.ts:9-31` — `COOKING_STAPLES` to filter by diet
- `src/components/meal/MealGenerator.tsx:66-71` — `segmentButtonClass` reused for diet buttons unchanged
- `src/lib/generation-copy.ts:29-31` — `EXHAUSTION_HINT_MEAL_TYPE` / `EXHAUSTION_HINT_TIME` pattern to follow for the new diet hint
- `src/pages/api/generate.ts:54` — `generateMeal(supabase, user.id, parsed.data)` — `diet_type` flows through automatically once schema and types are updated; no explicit route code change needed

## What We're NOT Doing

- No keto or paleo — macro enforcement requires nutritional data not available in the pantry
- No anti-inflammatory verification beyond LLM best-effort — not medical certification
- No server-side preference storage (account settings) — parked in `context/foundation/v2-ideas.md`
- No changes to the `favorites` table — `diet_type` persisted in `generation_history` only
- No display of `diet_type` on the favorites list — out of scope for this slice
- No code changes to `src/pages/api/generate.ts` — the route already passes `parsed.data` to `generateMeal`; once the Zod schema and `GenerateRequest` are updated, the wire is complete automatically

## Implementation Approach

Follow the existing constraint pattern (meal_type → prep_time → diet_type). Add `DietType` to the type layer, extend the Zod schema (with `"none"` default for backward compatibility), filter staples in `generation.ts`, extend `buildSystemPrompt`, add the DB column, and render a third segment button row in MealGenerator. Keep UI strings in their established locations: `diet-types.ts` for labels, `generation-copy.ts` for exhaustion copy, inline constants in `MealGenerator.tsx` for no-match panel hints.

## Critical Implementation Details

**Staples filtering**: `filterStaplesForDiet` is exported from `generation.ts` so it can be unit-tested directly without mocking. For `none`, `vegetarian`, and `anti_inflammatory` it returns `COOKING_STAPLES` unchanged. For `vegan` and `lactose_free` it removes `masło`. For `gluten_free` it removes `mąka`, `mąka pszenna`, and `mąka uniwersalna` — all three are wheat-derived; plain `"mąka"` (unqualified flour) defaults to wheat flour in Polish cooking — keeping `mąka kukurydziana` (corn flour, gluten-free). The returned set replaces `COOKING_STAPLES` in the staples list injected into the prompt.

**Diet constraint positioning**: append the diet constraint line after the meal-type line and before the prep-time line. When `dietType === 'none'`, no diet line is added.

**localStorage on mount**: the `useState` initializer reads `localStorage.getItem('mealdraft:diet_type')`, validates the value against the set of valid `DietType` values, and falls back to `'none'` on invalid/missing. A `useEffect` syncs every selection back to localStorage.

**DB migration CI note**: per `AGENTS.md`, `supabase/migrations/20260814000000_add_diet_type_to_generation_history.sql` must be manually applied to the hosted CI Supabase project before merging to `main`. Tier 2/3 CI depends on schema parity.

---

## Phase 1: Types, Zod schema, and DB migration

### Overview

Establish the type contract and DB column that every later phase depends on. No runtime behaviour changes in this phase — just the foundation.

### Changes Required

#### 1. `src/types.ts`

**File**: `src/types.ts`

**Intent**: Add the `DietType` union and extend `GenerateRequest` with `diet_type`. All other layers import from here, so this is the single source of truth for the valid diet values.

**Contract**: Add `export type DietType = "none" | "vegetarian" | "vegan" | "gluten_free" | "lactose_free" | "anti_inflammatory"` and add `diet_type: DietType` to `GenerateRequest`.

#### 2. `src/lib/generation-schema.ts`

**File**: `src/lib/generation-schema.ts`

**Intent**: Add `diet_type` to the Zod request schema with `"none"` as the default so any existing caller that omits the field stays valid.

**Contract**: Add `diet_type: z.enum(["none","vegetarian","vegan","gluten_free","lactose_free","anti_inflammatory"]).default("none")` to `generateRequestSchema`.

#### 3. `supabase/migrations/20260814000000_add_diet_type_to_generation_history.sql`

**File**: `supabase/migrations/20260814000000_add_diet_type_to_generation_history.sql`

**Intent**: Add a `diet_type` column to `generation_history` so every generated meal records the diet filter used at generation time.

**Contract**:

```sql
ALTER TABLE generation_history
  ADD COLUMN diet_type text NOT NULL DEFAULT 'none'
  CHECK (diet_type IN (
    'none', 'vegetarian', 'vegan',
    'gluten_free', 'lactose_free', 'anti_inflammatory'
  ));
```

No new RLS policies needed — existing per-user policies on `generation_history` cover the new column automatically.

### Success Criteria

#### Automated Verification

- `pnpm run build` completes without TypeScript errors after the type change
- Migration file exists at the correct path: `supabase/migrations/20260814000000_add_diet_type_to_generation_history.sql`

#### Manual Verification

- Migration applies cleanly to local Supabase (`npx supabase db push` or `db reset`)
- `generation_history` table has a `diet_type text NOT NULL DEFAULT 'none'` column with the CHECK constraint

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the local migration applied cleanly before proceeding to Phase 2.

---

## Phase 2: Generation engine

### Overview

Extend `generation.ts` to enforce the selected diet in the LLM system prompt and persist `diet_type` in the DB inserts. This phase contains the only algorithmically interesting code in the slice.

### Changes Required

#### 1. `src/lib/generation.ts`

**File**: `src/lib/generation.ts`

**Intent**: Add (a) sets of diet-conflicting staples, (b) an exported `filterStaplesForDiet` helper, (c) an English-language constraint map for the LLM prompt. Extend `buildSystemPrompt` to accept and apply `dietType`. Update `generateMeal` and `insertFailureSentinelRow` to include `diet_type` in DB inserts.

**Contract**:

```typescript
// Add DietType to the existing @/types import in generation.ts:
// import type { MealType, GenerateRequest, GenerationResult, DietType } from "@/types";

// Staple sets used for filtering
const ANIMAL_DERIVED_STAPLES: ReadonlySet<string>; // contains: "masło"
const GLUTEN_STAPLES: ReadonlySet<string>; // contains: "mąka", "mąka pszenna", "mąka uniwersalna"

// Exported for unit testing
export function filterStaplesForDiet(dietType: DietType): ReadonlySet<string>;
// Returns COOKING_STAPLES filtered: removes ANIMAL_DERIVED_STAPLES for vegan/lactose_free,
// removes GLUTEN_STAPLES for gluten_free, returns COOKING_STAPLES unchanged for others.

// English LLM constraint per diet (empty string for "none")
const DIET_TYPE_CONSTRAINT: Record<DietType, string>;
// Suggested values:
// vegetarian:       "The recipe must be vegetarian — no meat, poultry, fish, or seafood."
// vegan:            "The recipe must be vegan — no meat, poultry, fish, seafood, dairy, eggs, honey, or any other animal-derived ingredient."
// gluten_free:      "The recipe must be gluten-free — use no wheat, barley, rye, spelt, or products derived from them."
// lactose_free:     "The recipe must be lactose-free — use no dairy products (milk, cream, butter, cheese, yogurt, or similar)."
// anti_inflammatory:"The recipe should follow an anti-inflammatory diet — prefer olive oil, garlic, onion, turmeric, ginger, leafy greens, berries, fatty fish, nuts, and seeds; avoid refined sugars and heavily processed foods."

// Updated signature
export function buildSystemPrompt(
  pantryItems: string[],
  mealType: MealType,
  maxPrepTime: number | null,
  dietType: DietType,
): string;
// Uses filterStaplesForDiet(dietType) instead of COOKING_STAPLES directly.
// Appends `Diet constraint: ${DIET_TYPE_CONSTRAINT[dietType]}` after the meal-type line when dietType !== "none".
```

`insertFailureSentinelRow` gains a `dietType: DietType` parameter and includes it in the insert.  
`recordGenerationFailure` gains a `dietType: DietType` parameter and forwards it to `insertFailureSentinelRow`. New signature: `recordGenerationFailure(supabase, userId, mealType, dietType, cause)`. This function is the intermediary called by `generateMeal` at both retry-exit points; without this update `insertFailureSentinelRow`'s new parameter would produce a TypeScript compile error.  
`generateMeal` passes `input.diet_type` to both `buildSystemPrompt` and all DB inserts (history row + both `recordGenerationFailure` call sites).

#### 2. `tests/integration/generation-failure-sentinel.test.ts`

**File**: `tests/integration/generation-failure-sentinel.test.ts`

**Intent**: Add `diet_type: "none"` to the existing `generateMeal` call. After Phase 1 adds `diet_type: DietType` to `GenerateRequest`, the object literal at line 69 is missing a required field; TypeScript will report a compile error on `pnpm run build` and `pnpm test` without this one-line fix.

**Contract**: In the `it(...)` block, update the `generateMeal` call to include `diet_type: "none"` alongside the existing fields.

### Success Criteria

#### Automated Verification

- `pnpm run build` passes
- Existing integration test (`tests/integration/generation-failure-sentinel.test.ts`) still passes (with the `diet_type: "none"` addition from change 2)
- _(Unit tests for_ `filterStaplesForDiet` _and_ `buildSystemPrompt` _are written in Phase 4; verify criterion 2.2 in the Progress section after Phase 4 completes, not before proceeding to Phase 3)_

#### Manual Verification

- Generating with `diet_type: "vegan"`: system prompt does not list `masło` in staples and contains the vegan constraint line
- A successful generation row in `generation_history` has the correct `diet_type` value

**Implementation Note**: Pause after Phase 2 manual verification before proceeding to Phase 3.

---

## Phase 3: UI layer

### Overview

Add the diet segment button row to the generator, wire localStorage persistence and exclusion-list reset, update both feedback panels with the diet hint, and add the new copy strings.

### Changes Required

#### 1. `src/lib/diet-types.ts` (new file)

**File**: `src/lib/diet-types.ts`

**Intent**: Centralise the 6 diet options with Polish UI labels, following the `meal-types.ts` pattern exactly. Imported by `MealGenerator.tsx`.

**Contract**:

```typescript
import type { DietType } from "@/types";
export const DIET_TYPE_OPTIONS: { value: DietType; label: string }[];
// Entries: none→"Brak", vegetarian→"Wegetariańska", vegan→"Wegańska",
//          gluten_free→"Bezglutenowa", lactose_free→"Bezlaktozowa",
//          anti_inflammatory→"Przeciwzapalna"
```

#### 2. `src/lib/generation-copy.ts`

**File**: `src/lib/generation-copy.ts`

**Intent**: Add the diet-type hint string used by the exhaustion panel (following the existing `EXHAUSTION_HINT_MEAL_TYPE` / `EXHAUSTION_HINT_TIME` pattern).

**Contract**: Add `export const EXHAUSTION_HINT_DIET_TYPE = "Zmień typ diety"`. The no-match panel hint is an inline constant in `MealGenerator.tsx` (matching how `HINT_MEAL_TYPE` and `HINT_TIME` are handled there today).

#### 3. `src/components/meal/MealGenerator.tsx`

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Introduce `dietType` state with localStorage persistence, render the diet segment button row, reset `shownNames` when diet changes, include `diet_type` in the fetch body, and conditionally show the diet hint in both feedback panels.

**Contract**:

- Import `DIET_TYPE_OPTIONS` from `@/lib/diet-types` and `EXHAUSTION_HINT_DIET_TYPE` from `@/lib/generation-copy`; add `DietType` to the type import from `@/types`
- Add `const HINT_DIET_TYPE = "Zmień typ diety"` as an inline module-level constant (parallel to existing `HINT_MEAL_TYPE` and `HINT_TIME`)
- `dietType` state: `useState<DietType>` — initializer reads `localStorage.getItem("mealdraft:diet_type")`, validates against `DIET_TYPE_OPTIONS` values, falls back to `"none"`
- `useEffect` watching `[dietType]`: (a) writes to `localStorage.setItem("mealdraft:diet_type", dietType)`, (b) calls `setShownNames([])` to reset exclusions
- Segment button group for diet: rendered using `segmentGroupClass` / `segmentButtonClass` / `data-active={dietType === value}`, placed between the meal-type row and the prep-time row; labelled with a heading that matches the style of the existing meal-type and prep-time row labels (e.g. `"Dieta:"` or the equivalent short Polish heading already used in that section)
- Fetch body: add `diet_type: dietType` alongside existing fields
- No-match panel: add `{dietType !== "none" && <li>{HINT_DIET_TYPE}</li>}` inside the hints list
- Exhaustion panel: add `{dietType !== "none" && <li>{EXHAUSTION_HINT_DIET_TYPE}</li>}` inside the exhaustion hints list

### Success Criteria

#### Automated Verification

- `pnpm run build` passes
- `pnpm run lint` passes

#### Manual Verification

- Six diet buttons render; "Brak" is selected by default (or last saved diet on return visits)
- Clicking a diet option highlights it (`data-active=true`) and deselects the previous
- Diet selection survives a page reload (localStorage persistence)
- Generating while a diet is selected: network request body includes `diet_type` with the correct value (check DevTools)
- Generating with "Wegańska": recipe contains no meat or dairy ingredients
- Generating with "Bezglutenowa": recipe contains no wheat-based ingredients
- Changing diet type resets the try-another exclusion indicator to 0
- No-match panel shows "Zmień typ diety" when diet ≠ Brak; hides it when Brak is active
- Exhaustion panel shows "Zmień typ diety" when diet ≠ Brak; hides it when Brak is active

**Implementation Note**: Pause after Phase 3 manual verification before proceeding to Phase 4.

---

## Phase 4: Unit tests

### Overview

Add fast, dependency-free unit tests for `filterStaplesForDiet` and the diet-constraint output of `buildSystemPrompt`.

### Changes Required

#### 1. `tests/unit/generation-diet.test.ts` (new file)

**File**: `tests/unit/generation-diet.test.ts`

**Intent**: Verify the two pure-function outputs introduced in Phase 2 without hitting the DB or network. Covers all 6 diet types for both staples filtering and prompt constraint injection.

**Contract**: Test cases must include:

`filterStaplesForDiet` cases:

- `'none'` → returned set equals `COOKING_STAPLES` (unchanged)
- `'vegetarian'` → returned set equals `COOKING_STAPLES` (`masło` is vegetarian-safe)
- `'vegan'` → returned set does not contain `"masło"`; all non-animal staples present
- `'lactose_free'` → returned set does not contain `"masło"`
- `'gluten_free'` → returned set does not contain `"mąka"`, `"mąka pszenna"`, or `"mąka uniwersalna"`; does contain `"mąka kukurydziana"`
- `'anti_inflammatory'` → returned set equals `COOKING_STAPLES`

`buildSystemPrompt` cases (use a fixed pantry array and `'lunch'` + `null` prep time):

- `'none'` → returned string does not contain `"Diet constraint:"`
- `'vegetarian'` → returned string contains `"vegetarian"` constraint line
- `'vegan'` → returned string contains `"vegan"` constraint line; does not contain `"masło"` in the staples section
- `'gluten_free'` → returned string does not contain `"mąka"`, `"mąka pszenna"`, or `"mąka uniwersalna"` in the staples section

### Success Criteria

#### Automated Verification

- `pnpm test` passes (all existing tests + new tests green)

---

## Phase 5: Context updates

### Overview

Record roadmap traceability in the change folder and park the account-preferences follow-up in v2-ideas.

### Changes Required

#### 1. `context/changes/diet-type-filter/change.md`

**File**: `context/changes/diet-type-filter/change.md`

**Intent**: Mark the change as planned and add S-07 traceability so impl-review has a baseline.

**Contract**: ✅ **Already done during planning** — `change.md` has `status: planned` and S-07 traceability. Verify only; no write needed.

#### 2. `context/foundation/v2-ideas.md`

**File**: `context/foundation/v2-ideas.md`

**Intent**: Park the account-level preference persistence idea so it survives to a future planning session without derailing this slice.

**Contract**: ✅ **Already done during planning** — `v2-ideas.md` has the "Account-level preference settings (post S-07)" section. Verify only; no write needed.

### Success Criteria

#### Manual Verification

- `change.md` has `status: planned` and S-07 traceability in `## Notes` ✅
- `v2-ideas.md` has the account-preferences section ✅

---

## Testing Strategy

### Unit Tests

- `tests/unit/generation-diet.test.ts` — covers `filterStaplesForDiet` (all 6 diet types) and `buildSystemPrompt` diet constraint output (4 representative cases)

### Integration Tests

- Existing `generation-failure-sentinel.test.ts` — requires `diet_type: "none"` added to its `generateMeal` call (Phase 2 change 2); backward-compatible at runtime but TypeScript type-checks the object literal

### E2E

- No new E2E spec for this slice — the live generation path is already covered by existing E2E; diet correctness is verified manually and by unit tests

### Manual Testing Steps

1. Open generator — confirm 6 diet buttons render; "Brak" pre-selected
2. Select "Wegańska" → generate → recipe contains no meat or dairy
3. Select "Bezglutenowa" → generate → recipe contains no wheat-based ingredients
4. Reload page → "Wegańska" (or last-selected) is still active
5. Generate → tap "Inny przepis" twice → change diet to "Brak" → exclusion count resets
6. Use a small pantry + restrictive diet → trigger no_match → confirm "Zmień typ diety" hint appears
7. Check `generation_history` in Supabase → `diet_type` column populated correctly on each row

## Performance Considerations

No performance impact: `filterStaplesForDiet` is a single O(n) set-filter on a ~20-item set, called once per generation request.

## Migration Notes

`supabase/migrations/20260814000000_add_diet_type_to_generation_history.sql` must be manually applied to the hosted CI Supabase project before merging to `main` (per `AGENTS.md`).

Rollback: `ALTER TABLE generation_history DROP COLUMN diet_type;`

## References

- Roadmap slice S-07: `context/foundation/roadmap.md`
- Existing meal_type pattern: `src/lib/meal-types.ts:3-7`
- Segment button class: `src/components/meal/MealGenerator.tsx:66-71`
- COOKING_STAPLES: `src/lib/generation.ts:9-31`
- buildSystemPrompt: `src/lib/generation.ts:56-94`
- Exhaustion copy pattern: `src/lib/generation-copy.ts:29-31`
- CI migration note: `AGENTS.md` — "Whenever a new DB migration is added…"

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Types, Zod schema, and DB migration

#### Automated

- [x] 1.1 `pnpm run build` passes after type changes — 7300595
- [x] 1.2 Migration file exists at correct path and filename — 7300595

#### Manual

- [x] 1.3 Migration applies cleanly to local Supabase — 7300595
- [x] 1.4 `generation_history.diet_type` column present with correct DEFAULT and CHECK — 7300595

### Phase 2: Generation engine

#### Automated

- [x] 2.1 `pnpm run build` passes — 38e6631
- [x] 2.2 Existing `generation-failure-sentinel.test.ts` still passes (with diet_type: "none" added — see Phase 2 change 2) — 38e6631
- [ ] 2.3 Unit tests (Phase 4) pass — check after Phase 4 completes, not a Phase 2 gate

#### Manual

- [x] 2.4 Vegan prompt excludes `masło` from staples and includes vegan constraint line — deferred: verify during Phase 3 manual testing
- [x] 2.5 Successful generation inserts correct `diet_type` in `generation_history` — deferred: verify during Phase 3 manual testing

### Phase 3: UI layer

#### Automated

- [x] 3.1 `pnpm run build` passes
- [x] 3.2 `pnpm run lint` passes

#### Manual

- [x] 3.3 Six diet buttons render; "Brak" is default
- [x] 3.4 Active diet button highlights correctly
- [x] 3.5 Diet selection persists across page reload
- [x] 3.6 Generating with diet active — network request body includes correct `diet_type`
- [x] 3.7 Changing diet resets try-another exclusion count
- [x] 3.8 Wegańska generation — meat- and dairy-free recipe
- [x] 3.9 Bezglutenowa generation — no wheat-based ingredients
- [x] 3.10 Diet hint in no-match panel (conditional on diet ≠ Brak)
- [x] 3.11 Diet hint in exhaustion panel (conditional on diet ≠ Brak)

### Phase 4: Unit tests

#### Automated

- [ ] 4.1 `pnpm test` passes (all existing + new tests green)

### Phase 5: Context updates

#### Manual

- [x] 5.1 `change.md` has `status: planned` with S-07 traceability — done during planning
- [x] 5.2 `v2-ideas.md` has account-preferences section — done during planning
