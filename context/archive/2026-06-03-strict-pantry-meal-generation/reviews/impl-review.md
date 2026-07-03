<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Strict-Pantry Meal Generation (S-03)

- **Plan**: context/changes/strict-pantry-meal-generation/plan.md
- **Scope**: Phases 1–5 (all complete per Progress)
- **Date**: 2026-06-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Prior recipe stays visible after generate error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/meal/MealGenerator.tsx:114-116
- **Detail**: On `parsed.kind === "error"`, `lastRecipe` and `historyId` are not cleared while the error alert renders, so a previous success card can remain visible after a failed run (e.g. 429/500 after changing meal type or time). The `no_match` branch correctly clears recipe state (106-107).
- **Fix**: In the error branch, call `setLastRecipe(null)` and `setHistoryId(null)` (mirror `no_match`), or clear both at the start of `handleGenerate`.
- **Decision**: FIXED — clear at start of `handleGenerate` (user triage)

### F2 — Generator load-error banner hidden on desktop

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/meal/MealGenerator.tsx:121-122
- **Detail**: Plan Phase 3 manual (3.3) and Phase 4 (4.5) require the Polish load banner in the generator panel when `loadError` is true. `PantryWidget` shows the banner on all viewports; `MealGenerator` wraps the banner in `md:hidden`, so desktop two-column layout shows the banner only in the pantry column, not in the generator column. Button is correctly disabled via `canGenerate`.
- **Fix**: Remove `md:hidden` from the generator load-error banner wrapper so desktop users see the same message in both columns.
- **Decision**: ACCEPTED — desktop: banner in pantry only to avoid duplicate on one screen; mobile: banner in both tabs via `md:hidden` on generator panel

### F3 — Loading button copy abbreviated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/meal/MealGenerator.tsx:189
- **Detail**: Plan Polish table specifies loading text _Tworzę przepis…_; implementation shows _Tworzę…_ on the button during loading.
- **Fix**: Change loading label to `Tworzę przepis…` per plan copy table.
- **Decision**: FIXED

### F4 — “Dowolny czas” visible label abbreviated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/meal/MealGenerator.tsx:23
- **Detail**: Plan specifies visible preset _Dowolny czas_; button shows _Dow._ with full text only in `title`/`aria-label`. Functionally correct; visual copy drifts from plan table.
- **Fix**: Use label `Dowolny czas` in `TIME_PRESETS` or widen button styling to fit full text.
- **Decision**: FIXED

### F5 — 429 mapped by status only (not body error key)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/parse-generate-response.ts:64-66
- **Detail**: Plan contract says map `status === 429` and `error === 'rate_limit_exceeded'`. Parser maps on status 429 only. Current API always returns 429 with that error key (`generate.ts:51`), so behavior matches today; drift matters only if a non-rate-limit 429 is introduced later.
- **Fix**: Optionally tighten with `parseErrorBody(body) === 'rate_limit_exceeded'` before returning `rate_limit` code.
- **Decision**: FIXED

### F6 — Debug `data-*` attributes on shell root

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/dashboard/DashboardShell.tsx:72-73
- **Detail**: `data-pantry-count` and `data-load-error` on `DashboardShell` root are not in the plan. Harmless for production; useful for manual QA.
- **Fix**: Remove before release if you want zero unplanned DOM surface, or document as intentional dev aid.
- **Decision**: FIXED

## Automated verification (re-run during review)

| Command          | Result        |
| ---------------- | ------------- |
| `pnpm run lint`  | PASS (exit 0) |
| `pnpm run build` | PASS (exit 0) |

## Git scope (6e66226^..8d3056f)

Planned runtime files all present in diff. `generation-copy.ts` is plan-allowed EXTRA. `MealGeneratorPlaceholder.astro` removed from `src/`. Docs/context files in diff are expected for this slice.
