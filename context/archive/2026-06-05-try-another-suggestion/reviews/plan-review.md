<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Try Another Suggestion (S-04)

- **Plan**: `context/changes/try-another-suggestion/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-05
- **Triage completed**: 2026-06-05
- **Verdict**: SOUND
- **Findings**: 1 critical, 3 warnings, 1 observation — **5 fixed, 0 pending**

## Verdicts

| Dimension             | Verdict (initial) | Verdict (post-triage) |
| --------------------- | ----------------- | --------------------- |
| End-State Alignment   | WARNING ⚠️        | PASS ✅               |
| Lean Execution        | PASS ✅           | PASS ✅               |
| Architectural Fitness | PASS ✅           | PASS ✅               |
| Blind Spots           | WARNING ⚠️        | PASS ✅               |
| Plan Completeness     | WARNING ⚠️        | PASS ✅               |

## Triage Summary

| ID  | Decision        | Plan change                                                                      |
| --- | --------------- | -------------------------------------------------------------------------------- |
| F1  | FIXED via Fix A | Added `loadingSource`; Try another keeps `status: 'success'` during fetch        |
| F2  | FIXED via Fix A | Pinned append-before-fetch as canonical `shownNames` strategy                    |
| F3  | FIXED           | Request-scoped `hadExclusions`; `feedback: 'exhausted'` vs first-time `no_match` |
| F4  | FIXED           | Preserve `shownNames` on exhaustion `no_match`                                   |
| F5  | FIXED           | Leave S-03 inline `NO_MATCH_*` strings unchanged                                 |

## Grounding

Grounding: 5/5 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Try another hidden during its own loading

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Try another button visibility + Phase 1 shared fetch
- **Status**: ✅ FIXED
- **Detail**: Phase 2 requires Try another visible when `status === "success"` and `!isLoading`, but the shared handler sets `status === "loading"` on any fetch (current `MealGenerator.tsx:65`, `isLoading = status === "loading"` at line 58). During Try another, `status` becomes `"loading"` so the button hides and the planned spinner + _Szukam innego…_ cannot render. Desired End State item 2 ("loading on that button only; card stays visible") is unreachable if followed literally.
- **Fix applied**: Fix A — `loadingSource: 'generate' | 'try_another' | null`; keep `status === "success"` during Try another loading.
- **Decision**: FIXED via Fix A

### F2 — Ambiguous `shownNames` update strategy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Session exclusion state contract
- **Status**: ✅ FIXED
- **Detail**: Contract said implementers may choose append-before-fetch OR update-on-success. Mixing both double-counts names; only updating on wire without mutating `shownNames` leaves rejected count at 0.
- **Fix applied**: Fix A — append-before-fetch canonical; `Odrzucono: N` = `shownNames.length`.
- **Decision**: FIXED via Fix A

### F3 — Exhaustion detection must be request-scoped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details vs Phase 3 exhaustion panel
- **Status**: ✅ FIXED
- **Detail**: Stale Try another response after Generuj could branch on empty `shownNames` and show wrong panel.
- **Fix applied**: `hadExclusions` captured at request start; `feedback: 'exhausted'` distinct from first-time `no_match`.
- **Decision**: FIXED

### F4 — `shownNames` rollback on exhaustion `no_match`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 shared fetch + Phase 3 exhaustion panel
- **Status**: ✅ FIXED
- **Detail**: Plan did not forbid rolling back `shownNames` on exhaustion, which would zero `Odrzucono: N`.
- **Fix applied**: Clear card on exhaustion `no_match` but preserve `shownNames`.
- **Decision**: FIXED

### F5 — Split copy sources for no_match strings

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 copy stub vs Phase 3 copy completion
- **Status**: ✅ FIXED
- **Detail**: S-03 `NO_MATCH_*` strings inline while new exhaustion copy moves to `generation-copy.ts`.
- **Fix applied**: Phase 3 explicitly leaves S-03 inline strings unchanged.
- **Decision**: FIXED — leave S-03 inline strings unchanged
