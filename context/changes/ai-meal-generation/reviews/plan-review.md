<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Meal Generation — Implementation Plan (F-02)

- **Plan**: `context/changes/ai-meal-generation/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-01
- **Verdict**: SOUND (updated after triage — all 4 warnings fixed)
- **Findings**: 0 critical, 4 warnings → all fixed, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS (F3 fixed) |
| Blind Spots | PASS (F1, F2 fixed) |
| Plan Completeness | PASS (F4 fixed) |

## Grounding

5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

Verified paths: `src/pages/api/pantry/index.ts` (76 lines, exact pattern referenced), `src/types.ts` (MealRecipe/MealType/GenerationHistoryEntry confirmed), `astro.config.mjs` (env schema at lines 17–22), `.env.example`, `src/lib/pantry-name.ts`. DB schema confirmed via migration: `generation_history.recipe` is nullable JSONB, INSERT-only RLS active, prune trigger at 20 rows. `meal_type` enum values match TypeScript union exactly.

## Findings

### F1 — Pantry fetch error not handled; unstructured 500 if DB fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — generateMeal, steps 1–5 (before the attempt loop)
- **Detail**: The attempt loop (step 6) only wraps the `generateObject` call and downstream steps. Steps 1–5 — including the pantry DB fetch — run outside any try/catch. If Supabase returns an error on the pantry query (transient network hiccup, RLS misconfiguration, cold-start timeout), the thrown exception propagates uncaught through `generateMeal`. The API route has no try/catch around the `generateMeal` call either. Astro/workerd will return an HTTP 500, but without the structured `{ error: "generation_failed" }` body the Desired End State contract specifies — the client receives an HTML error page instead of a parseable JSON response.
- **Fix A ⭐ Recommended**: Wrap the full `generateMeal` body in a top-level try/catch that returns `{ status: "error" }` on any unhandled throw.
  - Strength: Single defensive layer; keeps the existing attempt loop logic unchanged; produces the correct JSON response shape in all failure modes.
  - Tradeoff: Swallows non-LLM errors silently — caller can't distinguish a DB failure from an LLM failure (both appear as `{ status: "error" }`). Acceptable at MVP observability level.
  - Confidence: HIGH — the route's error contract is unambiguous; the pantry route uses the same defensive style for all DB calls.
  - Blind spot: History insert (step e) already has explicit error handling — the wrapping catch wouldn't double-handle it; provides coverage for steps 1–5 only.
- **Fix B**: Add explicit error handling to the pantry fetch (step 1) and return `{ status: "error" }` immediately on DB error.
  - Strength: Explicit — reader knows this path exists; can log a distinct error code for DB vs LLM failures.
  - Tradeoff: More verbose; future pre-loop steps would each need their own guard.
  - Confidence: MEDIUM — more surgical but requires discipline when the service grows.
  - Blind spot: Still leaves any future pre-loop steps uncovered unless the pattern is enforced by review.
- **Decision**: FIXED via Fix A — added step 0 top-level try/catch wrapper to generateMeal contract.

---

### F2 — Vercel AI SDK's internal maxRetries stacks with outer retry-once

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — generateMeal, step 6a (generateObject call)
- **Detail**: The Vercel AI SDK's `generateObject` has an internal `maxRetries` parameter that defaults to 2 (3 total attempts before throwing). The plan's outer attempt loop treats a throw from `generateObject` as a single failure and retries once. In the worst case, a flaky provider causes: outer attempt 1 → SDK tries 3× → throws; outer attempt 2 → SDK tries 3× → throws → sentinel insert. That is 6 LLM calls per user request, not 2. The Performance Considerations section documents "retry-once worst case: ~4s" but this assumes SDK retries don't fire. With all retries active and a slow provider, worst case is closer to 12s+. The plan's pre-flight doc lookup may surface this, but the `generateObject` call contract does not specify `maxRetries: 0`.
- **Fix A ⭐ Recommended**: Explicitly set `maxRetries: 0` on the `generateObject` call, handing retry control entirely to the outer loop.
  - Strength: Outer loop already has correct retry semantics (no retry on `no_match`, retry-once on pantry violation or throw). SDK retries duplicate work with no additional recovery strategy.
  - Tradeoff: None — the outer loop is strictly more aware of which errors warrant retrying.
  - Confidence: HIGH — standard approach when writing custom retry logic around the AI SDK.
  - Blind spot: Verify exact parameter name in the pre-flight doc lookup (SDK renames options occasionally).
- **Fix B**: Keep SDK defaults; document the 6-call worst case in Performance Considerations.
  - Strength: Zero code change; SDK retries on genuine provider errors the outer loop might not know to retry.
  - Tradeoff: Up to 6 LLM calls at a cost/latency that conflicts with the documented performance expectation.
  - Confidence: LOW — whether SDK retries fire on Zod parse failures vs network errors is undocumented.
  - Blind spot: SDK internal retry behavior on `json_schema` validation failures is unverified.
- **Decision**: FIXED via Fix A — added `maxRetries: 0` to the generateObject call spec in step 6a.

---

### F3 — z.union root schema generates anyOf; OpenAI Structured Outputs compatibility unverified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — `GenerationOutputSchema` definition
- **Detail**: `GenerationOutputSchema = z.union([z.object({ no_match: z.literal(true) }), MealRecipeSchema])` produces a top-level `{ anyOf: [...] }` JSON Schema. OpenAI's Structured Outputs mode (used by GPT-4.1-nano via OpenRouter with `require_parameters: true`) supports `anyOf` but requires each branch to have `additionalProperties: false`. The AI SDK's `zod-to-json-schema` conversion emits `additionalProperties: false` for root `z.object` schemas, but union branch handling varies by SDK version. A malformed schema would cause the OpenRouter call to fail with a 400, fall to the outer retry, and ultimately return `{ status: "error" }` to the client with no indication of why. The pre-flight doc lookup is scheduled but the union schema topology risk is not explicitly listed as a verification target.
- **Fix A ⭐ Recommended**: Add an explicit verification item to the pre-flight lookup: confirm that a two-branch `z.union` root schema produces a valid OpenAI Structured Outputs schema with the current AI SDK version. Fall back to Fix B if not confirmed.
  - Strength: No code change if confirmed; protects the implementer from a silent mid-build failure.
  - Tradeoff: Adds one lookup question; no code cost if it passes.
  - Confidence: HIGH — the lookup already targets `generateObject` schema handling; extending it by one question is trivial.
  - Blind spot: If anyOf support was added in a recent SDK version, older pinned versions would still fail.
- **Fix B**: Restructure to a single flat Zod schema avoiding top-level anyOf: `z.object({ no_match: z.literal(true).optional(), name: z.string().min(1).optional(), ... })`. Post-process: if `no_match === true` → no_match path; else validate MealRecipe fields with a secondary parse.
  - Strength: Eliminates `anyOf` at root; confirmed to work with OpenAI Structured Outputs.
  - Tradeoff: More complex post-processing; loses the clean Zod union type; requires a secondary parse to get a typed MealRecipe.
  - Confidence: HIGH — single-object schemas with optional fields are well-tested with Structured Outputs.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added z.union anyOf verification query to the pre-flight Context7 lookup, with explicit fallback instructions to Fix B if the check fails.

---

### F4 — TypeScript narrowing on z.union result unspecified; result.no_match causes compile error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — generateMeal, step 6c
- **Detail**: Step 6c says "If result is `{ no_match: true }`". The inferred type of `result` after `generateObject` is `{ no_match: true } | { name: string; prep_time_minutes: number; ingredients: string[]; steps: string[] }`. Writing `result.no_match === true` causes a TypeScript error: "Property 'no_match' does not exist on type '{ name: string; ... }'". The correct narrowing is `"no_match" in result`. The plan doesn't specify which check to use, so the implementer will hit a compile error on their first build pass.
- **Fix**: Specify `"no_match" in result` as the narrowing expression in step 6c: `if ("no_match" in result) { return { status: "no_match" }; }`.
- **Decision**: FIXED — specified `"no_match" in result` as the narrowing expression in step 6c.
