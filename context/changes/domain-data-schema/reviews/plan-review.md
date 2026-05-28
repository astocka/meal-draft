<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Domain Data Schema

- **Plan**: context/changes/domain-data-schema/plan.md
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict (after triage) |
|-----------|------------------------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 3/5 paths exist (2 intentionally missing — new `src/types.ts`, new `supabase/migrations/`), 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Prune trigger will fail under no-DELETE RLS

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1 — History prune trigger (§5) + RLS policies (§6)
- **Detail**: Plan denies DELETE on `generation_history` for authenticated users (correct for US-04 read-only intent), but the `AFTER INSERT` prune trigger runs as the invoking role by default. Without `SECURITY DEFINER`, the trigger's DELETE is subject to RLS and denied — the 21st insert rolls back entirely and history cannot grow past 20. Desired End State item 3 and manual test 1.7 would fail.
- **Fix A ⭐ Recommended**: Define `prune_generation_history()` as `SECURITY DEFINER`, owned by `postgres`, with `SET search_path = pg_catalog`. Scope deletes strictly to `NEW.user_id`. Do not add a user-facing DELETE RLS policy.
  - Strength: Keeps read-only history contract intact; standard Supabase pattern for privileged side effects inside triggers.
  - Tradeoff: Requires careful search_path hardening to avoid search_path injection.
  - Confidence: HIGH — well-documented Postgres/Supabase RLS + trigger interaction.
  - Blind spot: None significant once search_path is set.
- **Decision**: FIXED via Fix A (SECURITY DEFINER trigger)

### F2 — Missing explicit GRANT statements

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Row-level security policies (§6)
- **Detail**: Plan enables RLS but does not GRANT table privileges to `authenticated`. Local Supabase CLI may auto-expose new `public` tables, but hosted projects and newer Supabase defaults increasingly require explicit grants. RLS policies alone do not grant table access — clients using the anon key + JWT (`src/lib/supabase.ts`) could get permission errors in production even with correct policies.
- **Fix A ⭐ Recommended**: Add explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_products TO authenticated` (subset per table), `GRANT SELECT, INSERT, DELETE ON favorite_meals TO authenticated`, `GRANT SELECT, INSERT ON generation_history TO authenticated`. No grants to `anon` for domain tables.
  - Strength: Works consistently local and hosted; matches Supabase RLS guide pattern.
  - Tradeoff: Slightly more SQL in migration; must stay in sync if operations change.
  - Confidence: HIGH — common production footgun without grants.
  - Blind spot: Exact hosted project grant defaults not verified against user's Supabase project tier.
- **Decision**: FIXED via Fix A (explicit GRANTs per table)

### F3 — INSERT RLS anti-spoofing not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Row-level security policies (§6)
- **Detail**: Contract says `auth.uid() = user_id` for all operations but does not distinguish `USING` vs `WITH CHECK`. INSERT policies require `WITH CHECK ((select auth.uid()) = user_id)` to prevent clients inserting rows with another user's `user_id`. UPDATE on `pantry_products` needs both `USING` and `WITH CHECK` to prevent reassigning ownership.
- **Fix**: Expand RLS contract to specify per-operation syntax: INSERT uses `WITH CHECK`, SELECT/DELETE use `USING`, UPDATE uses both. Prefer `(select auth.uid())` form per Supabase performance guidance. Scope policies `TO authenticated`.
- **Decision**: FIXED via F2 edit (USING/WITH CHECK syntax in §6 contract)

### F4 — seed.sql gap severity overstated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis, Critical Implementation Details, plan-brief Key risk
- **Detail**: Plan states `db reset` "will fail" without `seed.sql`. Supabase CLI logs a warning for unmatched seed patterns but typically continues — migrations still apply. Severity is overstated; empty seed file (already in Phase 1 §7) is still good hygiene.
- **Fix**: Soften language to "logs a warning / incomplete seed step" rather than "will fail before migration is tested."
- **Decision**: FIXED (language softened in plan + plan-brief)

### F5 — pantry `updated_at` has no auto-update mechanism

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Pantry products table (§2)
- **Detail**: Schema includes `updated_at timestamptz NOT NULL DEFAULT now()` but no trigger or API contract to refresh it on UPDATE. If S-02 pantry edit API doesn't set it explicitly, `updated_at` stays equal to `created_at` after edits — misleading metadata, not user-visible in v1.
- **Fix A ⭐ Recommended**: Add a `BEFORE UPDATE` trigger on `pantry_products` setting `updated_at = now()` in the F-01 migration.
  - Strength: Correct metadata without burdening S-02 API layer.
  - Tradeoff: One more trigger in the migration.
  - Confidence: HIGH — trivial pattern.
  - Blind spot: None.
- **Fix B**: Defer to S-02 — API always sets `updated_at` on UPDATE.
  - Strength: Keeps F-01 migration smaller.
  - Tradeoff: Easy to forget in S-02; column becomes dead weight if omitted.
  - Confidence: MED — depends on S-02 plan discipline.
  - Blind spot: S-02 plan not written yet.
- **Decision**: FIXED via Fix A (BEFORE UPDATE trigger on pantry_products)
