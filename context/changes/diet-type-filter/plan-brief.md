# Diet Type Filter — Plan Brief

> Full plan: `context/changes/diet-type-filter/plan.md`

## What & Why

Add a diet-type filter to the meal generator so users can declare a dietary preference (vegetarian, vegan, gluten-free, lactose-free, or anti-inflammatory) before generating a meal. This is the first post-MVP feature (S-07) and directly extends the existing constraint model — the same pattern used for meal type and prep time.

## Starting Point

The generator today accepts two constraints — `meal_type` and `max_prep_time_minutes` — both flowing through a type → Zod schema → LLM prompt → UI segment buttons pipeline. There is no diet concept anywhere in the codebase; `generation_history` has no `diet_type` column; and `COOKING_STAPLES` contains four entries that conflict with specific diets: `masło` (animal-derived; excluded for vegan/lactose-free), and `mąka`, `mąka pszenna`, `mąka uniwersalna` (all wheat-derived; excluded for gluten-free). `mąka kukurydziana` (corn flour) is safe to keep.

## Desired End State

The generator renders a third segment button row with 6 diet options. The selection is enforced in the LLM system prompt (with conflicting staples filtered out before the prompt is built), stored in `generation_history`, and persisted in localStorage so the user's diet is pre-selected on return visits. No-match and exhaustion panels show a "Zmień typ diety" hint when a restrictive diet is active.

## Key Decisions Made

| Decision                 | Choice                                                                        | Why (1 sentence)                                                                                          | Source |
| ------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Diet options             | 6: none / vegetarian / vegan / gluten_free / lactose_free / anti_inflammatory | All six are reliably enforceable via LLM ingredient reasoning; keto requires macro data not in pantry     | Plan   |
| Anti-inflammatory        | Included as best-effort                                                       | LLM has strong nutritional knowledge for qualitative ingredient selection; no macro counting required     | Plan   |
| DB persistence           | `generation_history` only, not favorites                                      | Matches the product decision to keep favorites as pure recipe snapshots                                   | Plan   |
| Preference persistence   | localStorage (`mealdraft:diet_type`)                                          | Zero server changes; survives page reloads on the same device; account-level sync parked for future slice | Plan   |
| COOKING_STAPLES conflict | Filter in code per diet                                                       | Deterministic — LLM never sees the conflicting staple in those cases                                      | Plan   |
| Exclusion reset          | Reset `shownNames` when diet changes                                          | Changing diet is a new generation context; prior exclusions are irrelevant                                | Plan   |
| LLM model                | No change (gpt-4.1-nano)                                                      | Anti-inflammatory is qualitative ingredient reasoning, not macro calculation                              | Plan   |

## Scope

**In scope:**

- `DietType` union type + `GenerateRequest` extension
- Zod schema update (`diet_type` with `"none"` default for backward compatibility)
- DB migration adding `diet_type` to `generation_history`
- `filterStaplesForDiet` exported helper (removes conflicting staples per diet)
- `DIET_TYPE_CONSTRAINT` English LLM constraint map
- `buildSystemPrompt` signature extended with `dietType`
- New `src/lib/diet-types.ts` with Polish UI labels
- MealGenerator: diet state, localStorage persistence, segment buttons, fetch body update, feedback panel hints
- Unit tests for `filterStaplesForDiet` and `buildSystemPrompt` diet output

**Out of scope:**

- Keto / paleo (macro tracking required)
- Account-level preferences (future slice — parked in `v2-ideas.md`)
- Displaying diet on favorites list
- Any change to `src/pages/api/generate.ts` (pass-through is automatic)

## Architecture / Approach

The `diet_type` field follows the identical pattern to `meal_type` across all layers. The only new algorithmic piece is `filterStaplesForDiet`, which filters `COOKING_STAPLES` before injecting them into the system prompt — making diet-conflicting staples invisible to the LLM in those cases. The localStorage hook (read on mount, write on change) is a self-contained `useState` + `useEffect` pair in `MealGenerator.tsx`.

## Phases at a Glance

| Phase                       | What it delivers                                                                                                                                          | Key risk                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Types, schema, migration | `DietType` type, Zod field, `generation_history.diet_type` column                                                                                         | Migration must be manually applied to CI Supabase before merge                                                                                                                     |
| 2. Generation engine        | `filterStaplesForDiet`, `DIET_TYPE_CONSTRAINT`, extended `buildSystemPrompt`, `recordGenerationFailure` update, integration test one-line fix, DB inserts | Four conflicting staples must all be covered (`masło`, `mąka`, `mąka pszenna`, `mąka uniwersalna`); `recordGenerationFailure` must be updated alongside `insertFailureSentinelRow` |
| 3. UI layer                 | Diet segment buttons with label, localStorage, exclusion reset, feedback panel hints                                                                      | MealGenerator state grows; diet effect must not interfere with existing generation flow                                                                                            |
| 4. Unit tests               | Tests for `filterStaplesForDiet` (6 cases) and `buildSystemPrompt` (4 cases)                                                                              | None — pure functions, no mocking needed                                                                                                                                           |
| 5. Context updates          | Verify `change.md` and `v2-ideas.md` — both already completed during planning                                                                             | None                                                                                                                                                                               |

**Prerequisites:** S-03 done (strict-pantry generation in production) — already satisfied.  
**Estimated effort:** ~2 focused sessions across 5 phases.

## Open Risks & Assumptions

- Anti-inflammatory is best-effort — the LLM cannot guarantee medically certified compliance; acceptable for a cooking assistant
- LLM may occasionally ignore diet constraints for very small pantries — existing retry logic (2 attempts) provides a safety net

## Success Criteria (Summary)

- All 6 diet buttons render; selecting one produces a recipe that respects the diet constraint
- Diet selection survives page reload (localStorage) and resets the try-another exclusion list when changed
- `generation_history` rows include the correct `diet_type` value
