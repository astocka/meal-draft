<!-- PLAN-REVIEW-REPORT -->

# Plan Review — `diet-type-filter`

**Reviewed:** `context/changes/diet-type-filter/plan.md`  
**Date:** 2026-08-14  
**Verdict:** ✅ All 7 findings resolved — plan is ready for implementation

---

## Findings

| #   | Severity  | Area              | Title                                                             | Status   |
| --- | --------- | ----------------- | ----------------------------------------------------------------- | -------- |
| F1  | 🔴 HIGH   | Generation engine | `"mąka"` (plain flour) missing from GLUTEN_STAPLES and test cases | ✅ fixed |
| F2  | 🔴 HIGH   | Generation engine | `recordGenerationFailure` not updated — cascading type break      | ✅ fixed |
| F3  | 🔴 HIGH   | Plan structure    | Phase 2 verification requires Phase 4 — circular dependency       | ✅ fixed |
| F4  | 🟡 MEDIUM | Tests             | Integration test breaks TypeScript compilation after Phase 1      | ✅ fixed |
| F5  | 🟡 MEDIUM | Plan structure    | Phase 5 changes are already done — duplicate-work risk            | ✅ fixed |
| F6  | 🟢 LOW    | Generation engine | `DietType` import in `generation.ts` not stated                   | ✅ fixed |
| F7  | 🟢 LOW    | UI                | Diet buttons row label/heading unspecified                        | ✅ fixed |

---

## F1 — `"mąka"` missing from GLUTEN_STAPLES 🔴

**Location:** `## Critical Implementation Details`, Phase 2 contract, Phase 4 test cases

**Problem:** COOKING_STAPLES contains four flour entries:

- `"mąka"` — unqualified; in Polish cooking this defaults to wheat flour → **contains gluten**
- `"mąka pszenna"` — wheat flour (gluten)
- `"mąka uniwersalna"` — all-purpose flour (gluten)
- `"mąka kukurydziana"` — corn flour (gluten-free, safe to keep)

The plan's `GLUTEN_STAPLES` set only names `"mąka pszenna"` and `"mąka uniwersalna"`. Plain `"mąka"` is never mentioned. When the implementer follows the plan, the gluten-free prompt will still expose `"mąka"` to the LLM and the LLM may use it. The Phase 4 unit test case for `gluten_free` also only asserts those two entries are absent — the test will pass even with the bug in place.

**Fix:** Add `"mąka"` to `GLUTEN_STAPLES`. Update the Phase 4 test case for `gluten_free` to also assert `"mąka"` is absent from the filtered set.

**Resolution:** ✅ `"mąka"` added to `GLUTEN_STAPLES` in the Critical Implementation Details, the Phase 2 contract block, and both Phase 4 test cases (`filterStaplesForDiet` filter case and `buildSystemPrompt` staples-section case). Current State Analysis updated from "three" to "four" conflicting staples.

---

## F2 — `recordGenerationFailure` not updated 🔴

**Location:** Phase 2, `generation.ts` contract

**Problem:** The plan says to add `dietType: DietType` to `insertFailureSentinelRow` — but that function is never called directly by `generateMeal`. It is called through `recordGenerationFailure`:

```typescript
// generation.ts lines 128–138
async function recordGenerationFailure(
  supabase: SupabaseClient,
  userId: string,
  mealType: MealType, // ← also needs dietType, not mentioned in plan
  cause: unknown,
): Promise<GenerationResult> {
  await insertFailureSentinelRow(supabase, userId, mealType); // ← will type-error
  return { status: "error" };
}
```

`generateMeal` calls `recordGenerationFailure` at two points in the retry loop. When `insertFailureSentinelRow` gains a required `dietType` parameter, TypeScript will immediately fail on `recordGenerationFailure`'s call to it — unless `recordGenerationFailure` is also updated.

**Fix:** Add `recordGenerationFailure` to Phase 2's list of functions to update. New signature: `recordGenerationFailure(supabase, userId, mealType, dietType, cause)`.

**Resolution:** ✅ `recordGenerationFailure` added to the Phase 2 `generation.ts` contract with its new signature and an explanation of why it is the intermediary that must be updated.

---

## F3 — Phase 2 automated verification requires Phase 4 🔴

**Location:** Phase 2 `#### Automated Verification`, Progress item 2.2

**Problem:**

> "Unit tests added in Phase 4 pass for all diet-constraint and staples-filter cases"

Phase 4 is written after Phase 2. The implementation note says to pause after Phase 2 manual verification — but automated item 2.2 cannot be green at that point. The implementer either has to jump ahead to Phase 4 or skip the criterion, defeating the phase gate.

**Fix options:**

- **(Recommended)** Move unit tests to Phase 2 so they are written alongside the code they test — natural TDD ordering.
- Alternatively: reword 2.2 as "verified retroactively after Phase 4" and remove it from the Phase 2 Progress block.

**Resolution:** ✅ Phase 2 Automated Verification reworded — the unit-test criterion now explicitly states it is verified after Phase 4 completes and is not a gate for proceeding to Phase 3. Progress item 2.3 carries this note; 2.2 now covers the integration test fix.

---

## F4 — Integration test breaks TypeScript compilation 🟡

**Location:** Testing Strategy, Progress item 2.3

**Problem:** The plan states the integration test "still passes unchanged — the `diet_type: 'none'` default is backward-compatible." The default applies to Zod JSON-body parsing, but the test constructs a `GenerateRequest` object directly in TypeScript:

```typescript
// generation-failure-sentinel.test.ts lines 69–72
const result = await generateMeal(client, userId, {
  meal_type: mealType,
  max_prep_time_minutes: 30,
  // ← missing diet_type — TypeScript error after Phase 1
});
```

After Phase 1 adds `diet_type: DietType` to `GenerateRequest`, `pnpm run build` and `pnpm test` will report a type error here.

**Fix:** Note in Phase 1 or Phase 2 that `generation-failure-sentinel.test.ts` needs `diet_type: "none"` added to its `generateMeal` call. Add as an explicit change entry so it isn't missed.

**Resolution:** ✅ Added as Phase 2 change 2 — an explicit `#### 2. tests/integration/generation-failure-sentinel.test.ts` entry with Intent and Contract. Testing Strategy updated to note the test is not "unchanged". Progress item 2.2 now references this fix.

---

## F5 — Phase 5 changes already completed 🟡

**Location:** Phase 5 entirety, Progress items 5.1–5.2

**Problem:** Both Phase 5 changes were made during the planning session:

- `change.md` already has `status: planned` and S-07 traceability
- `v2-ideas.md` already has the account-preferences section

An implementer following the plan will attempt to apply the Phase 5 contract and either create duplicate content or be confused by finding nothing to do.

**Fix:** Replace Phase 5 contract entries with "already done during planning — verify only" and pre-check the Progress items `- [x]`.

**Resolution:** ✅ Phase 5 contracts now read "✅ Already done during planning — verify only". Progress items 5.1 and 5.2 are pre-checked `- [x]`.

---

## F6 — `DietType` import not stated in `generation.ts` 🟢

**Location:** Phase 2, `generation.ts` contract

**Problem:** `generation.ts` currently imports `MealType, GenerateRequest, GenerationResult` from `@/types`. The new functions using `DietType` require it to be imported. The plan's contract block doesn't mention this import update — a small omission that causes a compile error if missed.

**Fix:** Add `DietType` to the import statement in the Phase 2 contract.

**Resolution:** ✅ Phase 2 contract code block now opens with a comment showing the updated import line: `import type { MealType, GenerateRequest, GenerationResult, DietType } from "@/types"`.

---

## F7 — Diet buttons row label/heading unspecified 🟢

**Location:** Phase 3, `MealGenerator.tsx` contract

**Problem:** The plan specifies button group placement but says nothing about the visible label above the row. Existing meal-type and prep-time rows each have a label. Without a spec the implementer will invent or omit it.

**Fix:** Add a label spec to the Phase 3 contract, e.g. `"Dieta:"` matching the style of existing row labels.

**Resolution:** ✅ Phase 3 MealGenerator contract now specifies the diet group must be "labelled with a heading that matches the style of the existing meal-type and prep-time row labels (e.g. `"Dieta:"`)."
