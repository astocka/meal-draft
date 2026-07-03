<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pantry CRUD Implementation Plan

- **Plan**: context/changes/pantry-crud/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-05-31
- **Triage**: 2026-05-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 open (6 fixed)

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

### F1 — Dead 404 branch — PATCH returns 500 for not-found rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/pages/api/pantry/[id].ts:47–56
- **Detail**: The plan specified 404 when a PATCH targets a non-existent (or another user's) row. The implementation checks `if (!patchResult.data)` for this, but that check is unreachable dead code. Supabase's `.single()` surfaces a zero-row result as an error with code `'PGRST116'`, not as `data: null`. The error branch fires first, the code doesn't match `'23505'`, and the handler falls to the generic 500. Result: renaming a missing item silently returns 500. (Flagged independently by both review agents.)
- **Fix**: Add a PGRST116 check inside the existing error branch before the generic 500 fallback, and remove the dead `!patchResult.data` block:
  ```ts
  if (patchResult.error.code === "PGRST116") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  ```

  - Strength: Matches the plan spec exactly; same pattern Supabase docs recommend for `.single()` not-found handling.
  - Tradeoff: Minimal — two lines added, two lines removed.
  - Confidence: HIGH — PGRST116 is the standard PostgREST no-rows code.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — Unplanned strict character rules reject valid ingredients

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/pantry-name.ts
- **Detail**: `pantry-name.ts` is an unplanned extraction (not in the plan) but a clean, beneficial one — it DRYs the Zod schema across two API routes and the client. The extraction itself is fine. However, the schema adds two rules beyond the plan's `min(1).max(100)`: no digits (`!/\d/` test) and only Unicode letters, spaces, hyphens, apostrophes (`/^[\p{L}\s'-]+$/u`). These rules silently reject valid ingredient names: "Omega-3", "7UP", "B12 supplement", "Type 2 milk". The plan specified only length constraints; this is implicit scope expansion that affects the product's usability.
- **Fix A ⭐ Recommended**: Remove the character-restriction rules; keep only `min(1).max(100)` + the trim transform.
  - Strength: Matches the plan spec; any future character policy can be added explicitly with a PRD ref.
  - Tradeoff: Loses the mild spam/XSS-hint filter (though Supabase parameterizes queries so there's no injection risk).
  - Confidence: HIGH — plan was explicit about what validation to apply.
  - Blind spot: Whether the product team actually wants to restrict to letter-only names; worth a quick product check.
- **Fix B**: Document as an intentional product decision and add a PRD note.
  - Strength: Preserves the restriction if it's actually desired UX.
  - Tradeoff: Needs product buy-in; blocks "Omega-3" and similar.
  - Confidence: LOW — no PRD ref or design doc supports this constraint.
  - Blind spot: Didn't verify whether any existing pantry items in the DB would fail this validation if applied retroactively.
- **Decision**: FIXED via Fix A

### F3 — Missing user_id filter on GET reads (defense-in-depth gap)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/pantry/index.ts:24, src/pages/dashboard.astro:13
- **Detail**: PATCH and DELETE both apply `.eq("user_id", user.id)` as a second layer of defense on top of RLS. The GET in `index.ts` and the server prefetch in `dashboard.astro` do not. The plan's Key Discoveries section explicitly noted that the explicit user_id filter is "defense-in-depth, not the primary guard" — which implies it should appear on all queries, reads included. If RLS is ever misconfigured or a policy gap introduced, reads would expose all users' pantries.
- **Fix**: Add `.eq("user_id", user.id)` to both SELECT queries, matching the pattern already used on the write routes.
- **Decision**: FIXED

### F4 — Silent delete failure — no user feedback on rollback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/pantry/PantryWidget.tsx:87–109
- **Detail**: Add and rename both display inline error messages on failure. Delete silently rolls back — the item reappears with no explanation. A user on a flaky connection sees their delete "undo itself" and doesn't know why. Inconsistent with the UX contract set by the other two mutations.
- **Fix**: Add a `deleteError` state var and render an inline message in the delete failure handler, matching the pattern of `addError`.
- **Decision**: FIXED

### F5 — dashboard.astro silently swallows prefetch error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:13
- **Detail**: The server prefetch destructures only `{ data }` and discards the `error` field. If the Supabase query fails, `data` is null and the `?? []` fallback silently produces an empty pantry — the user sees a blank list with no indication that loading failed. The plan doesn't address this path but reliability best practice is to log/surface it.
- **Fix**: Destructure `{ data, error }` and add a `console.error` on failure. Optionally pass a `loadError` prop to PantryWidget for a user-visible "failed to load" message.
- **Decision**: FIXED (console.error on failure; loadError prop deferred to follow-up)

### F6 — React import style divergence

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/pantry/PantryWidget.tsx:1
- **Detail**: PantryWidget uses `import { useState } from "react"` (React 19 style; no default React import needed). The existing sibling SignInForm.tsx uses `import React, { useState } from "react"`. PantryWidget's style is the correct forward-looking form.
- **Fix**: Update SignInForm.tsx to drop the default React import when convenient, to align the island layer on one convention.
- **Decision**: FIXED

## Triage summary (2026-05-31)

All findings fixed. One follow-up deferred to `follow-ups/review-fixes.md` (loadError prop — out of original plan scope).
