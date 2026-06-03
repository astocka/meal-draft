<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Strict-Pantry Meal Generation (S-03)

- **Plan**: `context/changes/strict-pantry-meal-generation/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-03
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS (F1 fixed) |
| Lean Execution | PASS |
| Architectural Fitness | PASS (F3 fixed) |
| Blind Spots | PASS (F4 fixed) |
| Plan Completeness | PASS (F2, F5, F6 fixed) |

## Grounding

Grounding: 5/5 paths exist or correctly marked new ✓, 3/3 symbols ✓ (`generateRequestSchema`, `MealGeneratorPlaceholder`, `GenerateResponse`), brief↔plan ✓

## Findings

### F1 — Phase 2 wires MealGenerator before it exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — DashboardShell contract (~L153); Phase 2 manual vs Phase 4
- **Detail**: Phase 2 contract says track `pantryCount` and pass to `MealGenerator`, but `MealGenerator.tsx` is Phase 4 and does not exist. Phase 2 manual success criteria expect “generator area empty or shell chrome (before Phase 4)” — contradicts importing/wiring `MealGenerator` in Phase 2. Implementer following Phase 2 literally may fail the build or ship a broken import.
- **Fix A ⭐ Recommended**: Phase 2 — generator column shows empty shell/placeholder only; track `pantryCount` internally; wire `MealGenerator` + props in Phase 4 only.
  - Strength: Matches phased manual criteria; each phase builds cleanly.
  - Tradeoff: Phase 3 cannot pass `loadError` to `MealGenerator` until Phase 4 (pantry-only in Phase 3 is fine).
  - Confidence: HIGH — sub-agent and `src/` confirm no `MealGenerator` file yet.
  - Blind spot: None significant.
- **Fix B**: Add minimal `MealGenerator` stub in Phase 2 (empty div), flesh out in Phase 4.
  - Strength: Props wired early.
  - Tradeoff: Extra file churn; stub may be thrown away.
  - Confidence: MEDIUM — works but noisier than Fix A.
  - Blind spot: Stub props interface may drift before Phase 4.
- **Decision**: FIXED (Fix A)

### F2 — Progress missing Phase 2 topbar criterion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Manual Verification; `## Progress`
- **Detail**: Phase 2 lists manual criterion “No regression to sign-out topbar” but Progress has only 2.3 and 2.4 — no matching `- [ ] 2.5` checkbox. `/10x-implement` progress tracking will omit this check.
- **Fix**: Add `- [ ] 2.5 No regression to sign-out topbar` under Phase 2 Manual in `## Progress`.
- **Decision**: FIXED

### F3 — Nested island: remove Astro `client:load` on PantryWidget

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — dashboard.astro wiring (~L157–159)
- **Detail**: Today `PantryWidget` is hydrated via `<PantryWidget client:load …>` in `dashboard.astro:37`. Plan mounts only `DashboardShell client:load` but does not explicitly state that `PantryWidget` must be imported inside the shell **without** a separate `client:*` on `.astro`. Double-hydrating (Astro island + nested import) causes duplicate islands or hydration bugs.
- **Fix**: In Phase 2 `dashboard.astro` contract, add: “Remove `client:load` from `PantryWidget` in `.astro`; render `<PantryWidget … />` only as a child of `DashboardShell`.”
  - Strength: Matches Astro island composition model; aligns with pantry-crud pattern change.
  - Tradeoff: None — required for correct architecture.
  - Confidence: HIGH — verified current wiring at `dashboard.astro:37`.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — HTTP 400 may surface English Zod messages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — parser; Phase 4 — error panel
- **Detail**: `generate.ts:47` returns `{ error: parsed.error.issues[0]?.message }` on 400 — Zod messages are English. Plan promises Polish-only user-facing UI and maps `validation` to a generic error path, but does not say to **ignore** the API `error` string for 400. Implementer might display raw English in the inline panel.
- **Fix**: In `parseGenerateResponse` / Phase 4 contract, always show a fixed Polish validation message for `code: 'validation'`; never render API `error` body for 400.
  - Strength: Matches research “Polish only v1”; consistent with generic 500 copy.
  - Tradeoff: Less specific feedback for malformed requests (rare on dashboard).
  - Confidence: HIGH — API returns dynamic Zod text at `generate.ts:47`.
  - Blind spot: None significant.
- **Decision**: FIXED

### F5 — Meal type default left ambiguous

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — MealGenerator state (~L241)
- **Detail**: Contract says default `mealType` is “`lunch` or first PRD-aligned default.” PRD FR-008 does not specify a default meal type. Implementer may pick inconsistently.
- **Fix**: Pin default to `meal_type: 'lunch'` in plan copy table and Phase 4 contract (or document explicit product choice).
- **Decision**: FIXED

### F6 — Phase 5 change.md status instruction is stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — change.md (~L317–321)
- **Detail**: Phase 5 says set `status: planned` → `in_progress` during implement, but `change.md` is already `planned`. Wording implies flipping to `planned` again.
- **Fix**: Change Phase 5 contract to: “On `/10x-implement` start, set `status: in_progress`; on slice complete, set `implemented` (or project convention).”
- **Decision**: FIXED
