<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Domain Data Schema Implementation Plan

- **Plan**: context/changes/domain-data-schema/plan.md
- **Scope**: Phase 1 + Phase 2 of 2
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Unplanned second migration with schema change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260528140000_fix_history_prune_ordering.sql
- **Detail**: The plan specifies a single migration file (20260528120000_domain_data_schema.sql). A second unplanned migration was applied that adds a `seq bigint GENERATED ALWAYS AS IDENTITY` column to `generation_history` and rewrites the prune trigger to include `seq DESC` tie-breaking. The reason (bulk-insert non-determinism) is documented in the migration comment and is legitimate, but the schema change is not captured in the plan. The `seq` column also propagated into src/types.ts (see F3).
- **Fix A ⭐ Recommended**: Document as an addendum in plan.md
  - Strength: Plan stays the source of truth; future reviewers see the full rationale. Consistent with how this repo has handled discovered scope.
  - Tradeoff: Plan becomes slightly longer.
  - Confidence: HIGH — the fix itself is sound; only the paper trail is missing.
  - Blind spot: None significant.
- **Fix B**: No change — accept the undocumented deviation
  - Strength: Zero effort.
  - Tradeoff: Future agents reading the plan will see a mismatch between the "single migration" contract and two files on disk, and may incorrectly flag the second file as drift.
  - Confidence: LOW — this repo uses plan docs as ground truth for reviews.
  - Blind spot: None.
- **Decision**: FIXED via Fix A — addendum added to plan.md

### F2 — Stale index not dropped after migration 2

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260528140000_fix_history_prune_ordering.sql
- **Detail**: Migration 1 creates `generation_history_user_generated_at_idx` on `(user_id, generated_at DESC)`. Migration 2 creates `generation_history_user_generated_at_seq_idx` on `(user_id, generated_at DESC, seq DESC)` but never drops the original. Both indexes now exist on the table. The new index is a strict superset of the old one (same leading columns), so the old index is never chosen by the planner and adds pure write overhead on every INSERT/DELETE.
- **Fix**: Create a new migration that drops the old index: `DROP INDEX public.generation_history_user_generated_at_idx;`
- **Decision**: FIXED — created supabase/migrations/20260529120000_drop_stale_history_index.sql

### F3 — Internal `seq` field exposed in domain TS type

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/types.ts:31
- **Detail**: `GenerationHistoryEntry` includes `seq: number`, a tie-breaking identity column added for internal DB ordering in migration 2. The plan's type contract lists five domain fields only. `seq` is an implementation artifact that downstream slices (S-06 history UI) will receive in query results and may mistakenly render or include in filter logic.
- **Fix**: Omit `seq` from `GenerationHistoryEntry` and cast/strip it in query helpers when needed, or mark it `readonly seq?: number` as an implementation hint not for UI use.
- **Decision**: FIXED — changed `seq: number` to `readonly seq?: number` in src/types.ts

### F4 — Unplanned CHECK constraint on `favorite_meals`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260528120000_domain_data_schema.sql:46-53
- **Detail**: The `favorite_meals_recipe_shape_check` constraint validates recipe JSON structure (key presence + array types for ingredients/steps). The plan's contract only specifies column definitions — it doesn't mention a CHECK constraint. The addition is additive, defensive, and consistent with the PRD intent. No breakage risk. Flagged for plan completeness only.
- **Fix**: Document as an addendum in plan.md ("added recipe shape CHECK constraint as defence-in-depth") or accept as is.
- **Decision**: FIXED — noted in plan.md addendum

### F5 — Config file changes bundled in schema commit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit 896dce6 (.gitattributes, .prettierrc.json)
- **Detail**: Commit 896dce6 includes `.gitattributes` and `.prettierrc.json` changes alongside the domain migration. These are out-of-scope config files. Already committed so not actionable — noted only for future hygiene.
- **Fix**: No action needed. Note for future work: config-only changes should be in a separate commit from schema/feature work.
- **Decision**: ACCEPTED-AS-RULE: Keep config changes in separate commits from schema/feature work
