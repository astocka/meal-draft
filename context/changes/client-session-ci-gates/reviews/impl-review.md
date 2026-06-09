<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Client Session + CI Gates

- **Plan**: context/changes/client-session-ci-gates/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension           | Verdict    |
| ------------------- | ---------- |
| Plan Adherence      | WARNING ⚠️ |
| Scope Discipline    | PASS ✅    |
| Safety & Quality    | WARNING ⚠️ |
| Architecture        | PASS ✅    |
| Pattern Consistency | PASS ✅    |
| Success Criteria    | PASS ✅    |

## Findings

### F1 — Stray session file under `tests/e2e/playwright/.auth/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/auth.setup.ts:5
- **Detail**: `auth.setup.ts` resolves auth storage via `process.cwd()` while `playwright.config.ts:10` uses `__dirname` (repo root). They match when cwd is repo root, but an untracked `tests/e2e/playwright/.auth/user.json` exists locally — session JWTs can land outside the gitignored `/playwright/.auth/` path.
- **Fix**: Use a single shared path constant (repo-root `playwright/.auth/user.json` via `import.meta.url` / config export) in both files; delete stray `tests/e2e/playwright/.auth/`.
  - Strength: Eliminates path drift; aligns with config.
  - Tradeoff: Small refactor across setup + config.
  - Confidence: HIGH — stray file is present in working tree.
  - Blind spot: None significant.
- **Decision**: FIXED — shared `tests/e2e/auth-path.ts`; stray `tests/e2e/playwright/.auth/` removed

### F2 — Gitignore does not cover nested `playwright/.auth/` dirs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .gitignore:39
- **Detail**: Only `/playwright/.auth/` is ignored. Nested paths like `tests/e2e/playwright/.auth/` are not, increasing accidental commit risk for session cookies.
- **Fix**: Add `**/playwright/.auth/` to `.gitignore`.
- **Decision**: FIXED

### F3 — Uncommitted `scripts/*.mjs` fail `pnpm run lint`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — blocks clean merge if committed as-is
- **Dimension**: Success Criteria
- **Location**: scripts/e2e-auth.mjs, scripts/e2e-verify-isolation.mjs
- **Detail**: Committed branch passes lint. Uncommitted isolation scripts (`test:e2e:isolation`) trigger 81 ESLint errors (`no-undef` for Node globals, strict TS rules on `.mjs`). Phase 4 automated criterion 4.1 requires lint green after doc edits.
- **Fix**: Add an ESLint override for `scripts/**/*.mjs` (Node env + relaxed type-checked rules), or convert scripts to `.ts` with proper config — before committing.
  - Strength: Restores Tier 1 lint gate with scripts included.
  - Tradeoff: Config churn vs. script rewrite.
  - Confidence: HIGH — reproduced locally.
  - Blind spot: Pre-commit hook may still pass if scripts stay untracked.
- **Decision**: FIXED — ESLint `scripts/**/*.mjs` override in eslint.config.js

### F4 — Plan Progress items 1.4 and 3.1 still open

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural/process gate; CI is authoritative for 3.1
- **Dimension**: Success Criteria
- **Location**: plan.md Progress §1.4, §3.1
- **Detail**: `1.4` full local `playwright test` is unchecked (Windows worker teardown makes this impractical; `test:e2e:isolation` is the documented substitute). `3.1` Tier 3 E2E on same-repo PR not yet verified — user intends to validate via PR.
- **Fix A ⭐ Recommended**: Open same-repo PR; confirm all three CI tiers green; tick 3.1; tick 1.4 with note referencing `pnpm test:e2e:isolation` on Windows per AGENTS.md.
  - Strength: Matches plan intent without fighting Windows Playwright teardown.
  - Tradeoff: Local full-suite parity deferred to Linux CI.
  - Confidence: HIGH — isolation script verified 2026-06-09.
  - Blind spot: CI secrets / migration parity on hosted Supabase project.
- **Fix B**: Force local `pnpm test:e2e` green on Windows before merge.
  - Strength: Strict plan literalism.
  - Tradeoff: High time cost; known worker hang after tests pass.
  - Confidence: LOW on Windows.
  - Blind spot: None.
- **Decision**: FIXED via Fix A — 1.4 + 3.1 ticked after PR `test/e2e` → `main` all tiers green (8905507, c05fa8d)

### F5 — `try-another-stale-response` uses `page.unroute` not `unrouteAll`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/try-another-stale-response.spec.ts:75
- **Detail**: Plan Critical Details say `page.unrouteAll()` when route-mocking. `seed.spec.ts` and `no-match-info-panel.spec.ts` use `unrouteAll`; stale-response uses single `unroute`.
- **Fix**: Change to `page.unrouteAll({ behavior: "ignoreErrors" })` for consistency.
- **Decision**: FIXED

### F6 — `change.md` still `status: implementing`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: context/changes/client-session-ci-gates/change.md:4
- **Detail**: Expected before epilogue. Epilogue (`status: implemented`) should run after 1.4/3.1 close and user confirms.
- **Decision**: FIXED — epilogue: `change.md` → `status: implemented` after F4 CI verification

### F7 — Uncommitted work not yet on branch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM
- **Dimension**: Scope Discipline
- **Location**: git working tree
- **Detail**: `scripts/`, `test:e2e:isolation`, PLAYWRIGHT_SKIP_SETUP, test-plan/AGENTS updates are local-only. PR will be incomplete until committed.
- **Fix**: Commit isolation tooling + doc updates after F3 lint fix.
- **Decision**: FIXED — branch `test/e2e` complete; docs synced 2026-06-10 (test-plan, AGENTS, E2E-RULES, plan addendum)
