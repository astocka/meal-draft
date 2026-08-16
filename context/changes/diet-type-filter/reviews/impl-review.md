<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Diet Type Filter

- **Plan**: context/changes/diet-type-filter/plan.md
- **Scope**: All phases (1–5)
- **Date**: 2026-08-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 4 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Pantry violation check uses full COOKING_STAPLES, not diet-filtered set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/generation.ts:276-279
- **Detail**: `buildSystemPrompt` correctly excludes "masło" from the prompt's staple allowlist for vegan/lactose_free via filterStaplesForDiet. But the post-generation pantry violation check on line 278 still validates against raw `COOKING_STAPLES`. If the LLM returns "masło" despite the diet constraint, the server lets it through, persists it to generation_history, and returns a diet-violating recipe to the user.
- **Fix A ⭐ Recommended**: Hoist `filterStaplesForDiet(input.diet_type)` before the attempt loop in `generateMeal`; use the returned set in both `buildSystemPrompt` and the violation check instead of calling filterStaplesForDiet inside buildSystemPrompt and COOKING_STAPLES in the check.
  - Strength: Single source of truth for allowed staples per generation call; violation check becomes consistent with the prompt.
  - Tradeoff: Minor refactor of buildSystemPrompt's internals; existing unit tests would need updating.
  - Confidence: HIGH — the bug is unambiguous; the fix is narrow.
  - Blind spot: Unit tests for buildSystemPrompt pass dietType; after refactor callers pass a pre-filtered set.
- **Fix B**: Add a separate per-diet exclusion set check after the existing violation check, without changing buildSystemPrompt.
  - Strength: No change to buildSystemPrompt signature or unit tests.
  - Tradeoff: Two parallel filter mechanisms — higher maintenance surface.
  - Confidence: MEDIUM — correct but adds complexity.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F2 — localStorage access in useState initializer is fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/meal/MealGenerator.tsx:93-97
- **Detail**: `localStorage` is called directly in the `useState` initializer. This works today because `dashboard.astro` mounts with `client:only="react"`. If that directive reverts to `client:load` or `client:idle`, Astro will attempt a server render in the Cloudflare Workers runtime where `localStorage` is undefined, throwing a ReferenceError at startup. The coupling between the localStorage init and the `client:only` directive is implicit and undocumented.
- **Fix A ⭐ Recommended**: Move localStorage read into a `useEffect([], [])` mount effect; initialize state to `"none"`.
  - Strength: SSR-safe regardless of the Astro directive; canonical React pattern for browser-only APIs.
  - Tradeoff: One-frame flicker (diet shows "Brak" briefly before switching to saved value). Negligible below the fold.
  - Confidence: HIGH — this is the correct React/SSR approach.
  - Blind spot: The persistence useEffect (lines 130-132) fires on mount too — ordering between hydration and persistence effects must be checked.
- **Fix B**: Document the coupling explicitly in both files via code comments.
  - Strength: Zero code change; the feature works correctly today.
  - Tradeoff: Comments are not enforced; a future refactor could silently break it.
  - Confidence: MEDIUM — acceptable short-term deferral.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F3 — LLM model upgraded gpt-4.1-nano → gpt-4.1-mini without plan coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: src/lib/generation.ts:231
- **Detail**: `plan-brief.md` decision table states "LLM model: No change (gpt-4.1-nano)". The actual commit (38e6631, Phase 2) changed the model to `gpt-4.1-mini`. The upgrade affects cost, latency, and capability for all generations — not just diet-type ones — and has no test coverage of its own.
- **Fix**: Add a "Post-implementation notes" paragraph to `context/changes/diet-type-filter/plan.md` documenting the deliberate model upgrade and its rationale.
- **Decision**: FIXED

### F4 — anti_inflammatory: prompt excludes sugar, but cukier remains in staple allowlist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/generation.ts:54-56
- **Detail**: `filterStaplesForDiet("anti_inflammatory")` returns COOKING_STAPLES unchanged, so "cukier" and "cukier biały" appear in the prompt's staple allowlist. Yet `DIET_TYPE_CONSTRAINT["anti_inflammatory"]` tells the model to "avoid refined sugars". For vegan/gluten_free the prompt and allowlist are consistent; for anti_inflammatory they are silently asymmetric.
- **Fix**: Add a comment on the `anti_inflammatory` code path in `filterStaplesForDiet` documenting the deliberate asymmetry: enforcement is prompt-only for this diet type.
- **Decision**: FIXED

### F5 — setShownNames([]) placed in onClick, not in dietType useEffect as planned

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/meal/MealGenerator.tsx:404 / 130-132
- **Detail**: The plan prescribes `useEffect([dietType])` to handle both localStorage write and `setShownNames([])`. Implementation splits this: useEffect (lines 130-132) writes to localStorage only; `setShownNames([])` is in the onClick handler. Functionally identical, but if diet ever changes via a non-click path, the exclusion list would not reset.
- **Fix**: Move `setShownNames([])` into the dietType useEffect alongside the localStorage write; remove it from the onClick handler.
- **Decision**: DISMISSED — ESLint rule `react-hooks/set-state-in-effect` forbids calling setState synchronously inside an effect body. The onClick placement is correct and required.

### F6 — Integration test does not assert diet_type on the sentinel row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/generation-failure-sentinel.test.ts:77-83
- **Detail**: `diet_type: "none"` was added to the generateMeal call, but the assertion SELECT list does not include `diet_type` and there is no `expect(rows?.[0]?.diet_type).toBe("none")`. A regression where `insertFailureSentinelRow` accidentally omits the column would not be caught.
- **Fix**: Add "diet_type" to the `.select(...)` string and add `expect(rows?.[0]?.diet_type).toBe("none")`.
- **Decision**: FIXED

### F7 — HINT_DIET_TYPE and EXHAUSTION_HINT_DIET_TYPE are identical strings in two locations

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/meal/MealGenerator.tsx:40 / src/lib/generation-copy.ts:33
- **Detail**: Both `HINT_DIET_TYPE` (local, line 40) and `EXHAUSTION_HINT_DIET_TYPE` (generation-copy.ts, line 33) equal "Zmień typ diety". If the copy changes, it requires updating in two places.
- **Fix**: Export a single `HINT_DIET_TYPE` constant from `generation-copy.ts` and import it in `MealGenerator.tsx` for both panels.
- **Decision**: FIXED
