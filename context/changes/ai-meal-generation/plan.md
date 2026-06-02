# AI Meal Generation — Implementation Plan (F-02)

## Overview

Implement the server-side generation path for F-02: a `POST /api/generate` endpoint backed by a
`src/lib/generation.ts` service that accepts pantry constraints, calls OpenRouter's
`openai/gpt-4.1-nano` via Vercel AI SDK `generateObject`, validates the result against the user's
pantry (with a soft staples allowlist), persists the outcome, and returns a typed discriminated
union to the caller.

## Current State Analysis

All DB tables (`pantry_products`, `generation_history`, `favorite_meals`) and TypeScript domain
types (`MealRecipe`, `MealType`, `GenerationHistoryEntry`) are live from F-01. No migrations are
needed for F-02. The canonical API route pattern is established by `src/pages/api/pantry/index.ts`.
No AI SDK is installed yet; `OPENROUTER_API_KEY` is not declared in the env schema.

## Desired End State

`POST /api/generate` is live, authenticated, and returns one of three structured outcomes:

- **Success** — `{ recipe: MealRecipe, history_id: string }` (HTTP 200); a row is inserted into
  `generation_history`.
- **No match** — `{ recipe: null, reason: "no_match" }` (HTTP 200); no DB write.
- **Error** — `{ error: "generation_failed" }` (HTTP 500); a sentinel row with `recipe: null` is
  inserted for operational monitoring.

**Verification**: Authenticated `POST /api/generate` with a non-empty pantry returns a valid
`MealRecipe` whose every non-staple ingredient is present in `pantry_products` for that user, and a
matching row is visible in `generation_history` in Supabase Studio.

### Key Discoveries

- `src/types.ts` already has `MealRecipe`, `MealType`, and `GenerationHistoryEntry`; three new
  export types are needed (`GenerateRequest`, `GenerateResponse`, `GenerationResult`).
- `src/pages/api/pantry/index.ts:1-76` is the verbatim pattern to copy for auth guard, Supabase
  client, JSON parse, Zod validation, and DB error mapping.
- `generation_history.recipe` is nullable JSONB; the prune trigger keeps 20 rows per user;
  INSERT-only RLS is already set. No schema changes needed.
- `global_fetch_strictly_public` is active in workerd — external HTTPS (OpenRouter) works;
  localhost Supabase does not reach workerd; use `astro dev` for the inner loop.
- `astro.config.mjs:17-22` is where the new env var must be declared so `astro:env/server`
  type-checks it.

## What We're NOT Doing

- No UI changes — `MealGeneratorPlaceholder.astro` is not touched (that is S-03's job).
- No streaming — `generateObject` awaits the full response; the NFR spinner is S-03's concern.
- No analytics/log table for no-match events — `console.warn` + `wrangler tail` is sufficient at
  MVP scale.
- No Cloudflare Workers AI binding — OpenRouter (external fetch) is the only provider.
- No few-shot examples in the prompt — zero-shot is correct for this task and model.
- No migration — all required schema exists.

## Implementation Approach

Three phases in dependency order:

1. **Foundation** — install the two new packages, declare the env secret, add the three new TS
   types. Everything downstream depends on these being in place first.
2. **Generation service** (`src/lib/generation.ts`) — protocol-agnostic orchestrator: pantry
   fetch → system prompt → LLM call with Vercel AI SDK `generateObject` → soft-pantry validation
   with retry-once → history insert → discriminated union return.
3. **API route** (`src/pages/api/generate.ts`) — thin HTTP adapter following the pantry pattern:
   auth → Supabase client → Zod parse → call service → map result to HTTP codes.

## Critical Implementation Details

**Soft-pantry validation must agree with the system prompt.** The `COOKING_STAPLES` set in
`src/lib/generation.ts` is exported and used in two places: (1) the `buildSystemPrompt` function
lists these items under "always available", and (2) `validatePantryCompliance` allows them without
checking the user's pantry. These two usages must reference the exact same constant — any divergence
produces a system prompt that promises an ingredient the validator will reject.

**Retry only applies to pantry validation failures, not to LLM `{ no_match: true }` responses.** If
the model explicitly returns `{ no_match: true }`, that is a semantic decision — retrying the same
prompt will produce the same answer. Short-circuit immediately and return `{ status: "no_match" }`
without consuming a second LLM call.

**`exclude_names` goes in the user turn, not the system prompt.** The system prompt (pantry +
constraints) is identical across S-03 and S-04 calls for the same pantry/meal-type/time combination.
Keeping `exclude_names` in the user message preserves the potential for system-prompt caching at the
OpenRouter layer and keeps `buildSystemPrompt` signature stable.

---

## Pre-flight: Context7 Doc Lookups

> **Status: COMPLETE (2026-06-02)** — All queries run; results recorded below; Fix B applied to Phase 2.

Run these two MCP sequences in Cursor **before writing any code**. The Vercel AI SDK moves fast and the OpenRouter provider is lightly documented — these queries pull current API surface that training data may not reflect.

### Before Phase 1 — confirm workerd compatibility

**Results:**

| Library | Context7 ID | Notes |
|---|---|---|
| Vercel AI SDK | `/vercel/ai` | Stable versions: v4 (`ai_4_3_19`), v5 (`ai_5_0_0`). `generateObject` is deprecated in v6 beta only — still fully available in stable. Uses standard `fetch` internally; no Node.js-only APIs. Workerd compatible. |
| OpenRouter AI SDK Provider | `/openrouterteam/ai-sdk-provider` | v0.7.5. `createOpenRouter({ apiKey })` confirmed. `plugins: [{ id: 'response-healing' }]` and `provider: { require_parameters: true }` syntax confirmed. |

**Workerd verdict**: No blocking compatibility issues. External HTTPS fetch to OpenRouter works via `global_fetch_strictly_public`. Do not skip `pnpm run build && pnpm run preview` before marking complete.

### Before Phase 2 — pull exact API surface for generation.ts

**Results:**

- `generateObject` API signature: confirmed unchanged in stable. `schema`, `schemaName`, `system`, `prompt`, `maxRetries`, `model` options all valid.
- **`z.union` schema verdict**: ⚠️ **RISKY** — OpenAI Structured Outputs in strict mode does not reliably support `anyOf` root schemas (which `z.union` emits). The AI SDK troubleshooting docs explicitly list incompatible patterns; Google AI requires a dedicated escape hatch for `z.union`. Going through OpenRouter adds further uncertainty about whether `strictJsonSchema: false` propagates. **Fix B applied** (see Phase 2 Zod schemas).
- OpenRouter provider syntax: `plugins: [{ id: 'response-healing' }]` and `provider: { require_parameters: true }` both confirmed against live docs.

**Fix B**: Replace `z.union` root schema with a single flat `z.object` where all `MealRecipe` fields are optional. Use `result.no_match === true` for no-match branch check. Call `MealRecipeSchema.parse(result)` on the success branch to regain full type safety. See Phase 2 Zod schemas section below.

---

## Phase 1: Foundation — Packages, Env, Types

### Overview

Install the two new npm packages required for LLM integration, declare the API key secret in the
Astro env schema, and extend `src/types.ts` with the three generation-specific types the service
and route will use.

### Changes Required

#### 1. Install Vercel AI SDK and OpenRouter provider

**File**: `package.json` (via pnpm)

**Intent**: Add `ai` (Vercel AI SDK) and `@openrouter/ai-sdk-provider` to `dependencies`. These
are the only packages needed; no other SDK is required.

**Contract**: Run `pnpm add ai @openrouter/ai-sdk-provider`. Both packages use `fetch` internally
and are confirmed compatible with the Cloudflare Workers (workerd) runtime.

#### 2. Register `OPENROUTER_API_KEY` in the Astro env schema

**File**: `astro.config.mjs`

**Intent**: Declare the OpenRouter API key as a server-side secret so `astro:env/server` exposes
it with proper TypeScript typing and Astro validates its presence at build time.

**Contract**: Add the following entry to the `env.schema` object alongside the existing
`SUPABASE_URL`, `SUPABASE_KEY`, and `SITE_URL` entries:

```typescript
OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```

#### 3. Document the new secret in `.env.example`

**File**: `.env.example`

**Intent**: Keep the local-dev onboarding file current so the next developer knows to add the key.

**Contract**: Append a line `OPENROUTER_API_KEY=` to `.env.example`. No value; this is a template.

#### 4. Add generation DTOs and discriminated union to `src/types.ts`

**File**: `src/types.ts`

**Intent**: Provide the three shared types that the service and API route both depend on, keeping
the type boundary in the one canonical types file.

**Contract**: Three new exports appended after the existing types:

- `GenerateRequest` — the request DTO: `{ meal_type: MealType; max_prep_time_minutes: number | null; exclude_names?: string[] }`
- `GenerateResponse` — the HTTP success response body: `{ recipe: MealRecipe; history_id: string }`
- `GenerationResult` — the service discriminated union:
  `{ status: "ok"; recipe: MealRecipe; history_id: string } | { status: "no_match" } | { status: "error" }`

### Success Criteria

#### Automated Verification

- `pnpm run build` completes without type errors after installing packages and adding types
- `pnpm run lint` passes with no new warnings

#### Manual Verification

- `OPENROUTER_API_KEY` appears in TypeScript IntelliSense when importing from `astro:env/server`
- `GenerateRequest`, `GenerateResponse`, `GenerationResult` are importable from `@/types`

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Generation Service

### Overview

Create `src/lib/generation.ts` — the protocol-agnostic service that orchestrates the full
generation pipeline: pantry fetch, system prompt construction, LLM call via `generateObject`,
soft-pantry validation with retry-once, history insert, and discriminated union return. The API
route delegates entirely to this function.

### Changes Required

#### 1. Create `src/lib/generation.ts`

**File**: `src/lib/generation.ts` (new)

**Intent**: Isolate all generation business logic from the HTTP layer, following the established
`src/lib/` pattern (see `src/lib/pantry-name.ts`, `src/lib/supabase.ts`). The service knows nothing
about HTTP — it receives typed inputs and returns a `GenerationResult`.

**Contract**: The file exports the following three symbols:

---

**`COOKING_STAPLES: ReadonlySet<string>`**

A hardcoded allowlist of universally available cooking basics that the LLM may include in a recipe
without the user having explicitly added them to their pantry. Exported so tests can verify
coverage.

Members (lowercase, trimmed): `water`, `salt`, `black pepper`, `pepper`, `white pepper`,
`olive oil`, `oil`, `vegetable oil`, `butter`, `sugar`, `flour`, `all-purpose flour`.

---

**`buildSystemPrompt(pantryItems: string[], mealType: MealType, maxPrepTime: number | null): string`**

Constructs the zero-shot PJ+ system prompt. The system prompt includes:

1. A description of the `MealRecipe` output schema in natural language (field names, types,
   purpose).
2. The user's pantry items listed under "**Primary ingredients (from your pantry):**".
3. The `COOKING_STAPLES` listed under "**Always available (no need to list):**".
4. The hard constraint: "Use ONLY ingredients from the two lists above — no substitutions, no
   additions."
5. Meal type constraint: "The meal must be a `{mealType}`."
6. Time constraint (only if `maxPrepTime` is not null): "`prep_time_minutes` must be ≤
   `{maxPrepTime}`."
7. No-match escape: "If no valid meal can be made from these ingredients within the constraints,
   return exactly `{ \"no_match\": true }` and nothing else."

---

**`generateMeal(supabase: SupabaseClient, userId: string, input: GenerateRequest): Promise<GenerationResult>`**

Orchestrates the full pipeline:

0. **Top-level error guard**: the entire function body (steps 1–6) is wrapped in a
   `try { … } catch (err) { console.error("generateMeal_unexpected_error", err); return { status: "error" }; }`.
   This ensures that any unhandled throw — transient Supabase error, cold-start timeout, unexpected
   runtime exception — produces the structured `{ status: "error" }` result the API route expects,
   rather than propagating an uncaught exception that would cause Astro/workerd to return an HTML 500.
   The catch block does not overlap with step 6b's explicit error handling (which handles `generateObject`
   throws inside the attempt loop) or step 6e's insert error guard — both of those return before reaching
   the outer catch.

1. **Pantry fetch**: `supabase.from("pantry_products").select("name").eq("user_id", userId)`.
   Extract `name` strings → `pantryItems: string[]`.
2. **Empty pantry guard**: if `pantryItems.length === 0`, log
   `console.warn("no_match: empty pantry", { meal_type, max_prep_time_minutes, pantry_size: 0 })`
   and return `{ status: "no_match" }`.
3. Build `pantryNamesLower: Set<string>` by normalising each item:
   `item.toLowerCase().trim()`.
4. Build `systemPrompt` via `buildSystemPrompt(pantryItems, input.meal_type, input.max_prep_time_minutes)`.
5. Build `userMessage`: `"Generate exactly one meal recipe."` — or, if `input.exclude_names` is
   non-empty, append `" Do not suggest any of these meals: {names.join(', ')}."`.

6. **Attempt loop** (max 2 iterations; index `attempt` starts at 1):

   a. Call `generateObject` with:
      - `model`: `openrouter("openai/gpt-4.1-nano", { plugins: [{ id: "response-healing" }], provider: { require_parameters: true } })`
      - `schema`: `GenerationOutputSchema` (flat `z.object` — Fix B; see Zod schemas below)
      - `schemaName: "MealRecipeOrNoMatch"`
      - `system`: `systemPrompt`
      - `prompt`: `userMessage`
      - `maxRetries: 0` — disables the SDK's internal retry (default: 2). The outer attempt loop owns all retry logic; letting the SDK retry 3× per attempt would produce up to 6 LLM calls in the worst case (outer retry-once × SDK retry-twice), conflating provider errors that should be retried with LLM semantic failures (pantry violation) that should not. With `maxRetries: 0`, one SDK call per outer attempt — worst case stays at 2 LLM calls.

   b. If `generateObject` **throws** (network error, provider error, Zod parse failure after
      healing):
      - If `attempt < 2`: increment `attempt`, `continue`.
      - If `attempt === 2`: `console.error("generation_error after retry", err)`;
        insert sentinel row `{ user_id: userId, name: "[generation failed]", meal_type: input.meal_type, recipe: null }`;
        return `{ status: "error" }`.

   c. If result is `{ no_match: true }` — use `result.no_match === true` for the check (Fix B: both branches share the same flat type, so `"no_match" in result` is not needed for TypeScript narrowing):
      - `console.warn("no_match: model decision", { meal_type, max_prep_time_minutes, pantry_size: pantryItems.length })`.
      - Return `{ status: "no_match" }` immediately (do **not** retry).

   d. **Strict-pantry validation**: call `MealRecipeSchema.parse(result)` first to obtain a fully-typed `MealRecipe` and surface any unexpected schema gaps from the model as a caught error (treat as a `generateObject` throw — apply retry logic from step 6b). Then for each `ingredient` in the parsed recipe, check that
      `ingredient.toLowerCase().trim()` is in `pantryNamesLower` OR in `COOKING_STAPLES`. If any
      ingredient fails:
      - If `attempt < 2`: `console.warn("pantry_violation: retrying", { attempt, ingredient })`;
        increment `attempt`, `continue`.
      - If `attempt === 2`: `console.warn("no_match: pantry violation after retry", { meal_type, pantry_size: pantryItems.length })`;
        return `{ status: "no_match" }`.

   e. **History insert**: use the `MealRecipeSchema.parse(result)`-typed value (call it `recipe`) from step 6d. `supabase.from("generation_history").insert({ user_id: userId, name: recipe.name, meal_type: input.meal_type, recipe }).select("id").single()`. If insert errors, log and return `{ status: "error" }`.

   f. Return `{ status: "ok", recipe, history_id: row.id }`.

**Zod schemas (local to the service file, not exported):**

> **Fix B applied** (pre-flight 2026-06-02): `z.union` root schema replaced with a flat `z.object`
> to avoid OpenAI Structured Outputs `anyOf` incompatibility via OpenRouter.

```typescript
const MealRecipeSchema = z.object({
  name: z.string().min(1),
  prep_time_minutes: z.number().int().positive(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
});

// Fix B: flat schema — all fields optional; branch determined at runtime.
const GenerationOutputSchema = z.object({
  no_match: z.boolean().optional(),
  name: z.string().min(1).optional(),
  prep_time_minutes: z.number().int().positive().optional(),
  ingredients: z.array(z.string().min(1)).optional(),
  steps: z.array(z.string().min(1)).optional(),
});
```

### Success Criteria

#### Automated Verification

- `pnpm run build` compiles `src/lib/generation.ts` without type errors
- `pnpm run lint` passes

#### Manual Verification

- With `pnpm run dev` and `OPENROUTER_API_KEY` set in `.env`: call `generateMeal` with a mocked
  Supabase returning 5 pantry items (e.g., chicken, rice, tomatoes, onion, garlic) → response is
  `{ status: "ok", recipe: { name, prep_time_minutes, ingredients, steps } }` where every non-staple
  ingredient is in the pantry list
- Call with 0 pantry items → `{ status: "no_match" }` returned without an LLM call (verify via
  `console.warn` output)
- Verify staples (e.g., salt, olive oil) in a returned recipe do not cause a validation failure

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: API Route

### Overview

Create the thin HTTP adapter at `src/pages/api/generate.ts` following the exact pantry route
pattern. The route is responsible only for: auth guard, Supabase client, JSON parse, Zod request
validation, delegating to `generateMeal`, and mapping the discriminated union to HTTP codes.

### Changes Required

#### 1. Create `src/lib/generation-schema.ts`

**File**: `src/lib/generation-schema.ts` (new)

**Intent**: Extract the request Zod schema to `src/lib/` following the same pattern as
`src/lib/pantry-name.ts` so it can be imported by the route and potentially reused elsewhere.

**Contract**: Exports `generateRequestSchema` — a Zod object schema that validates:
- `meal_type`: `z.enum(["breakfast", "lunch", "dinner"])`
- `max_prep_time_minutes`: `z.number().int().positive().nullable()` — positive integer or null
- `exclude_names`: `z.array(z.string()).optional().default([])` — defaults to empty array

#### 2. Create `src/pages/api/generate.ts`

**File**: `src/pages/api/generate.ts` (new)

**Intent**: HTTP adapter for the generation endpoint. Thin by design — all orchestration logic
lives in `src/lib/generation.ts`.

**Contract**: Exports `prerender = false` and a `POST` handler. The handler follows the exact
pantry route pattern:

1. Auth guard: `context.locals.user` — return 401 if absent.
2. Supabase client: `createClient(context.request.headers, context.cookies)` — return 503 if null.
3. JSON parse with try/catch — return 400 `{ error: "Invalid JSON body" }` on failure.
4. `generateRequestSchema.safeParse(body)` — return 400 with first Zod issue message on failure.
5. Call `generateMeal(supabase, user.id, parsed.data)`.
6. Map `GenerationResult` to HTTP response:
   - `{ status: "ok" }` → 200 `{ recipe, history_id }`
   - `{ status: "no_match" }` → 200 `{ recipe: null, reason: "no_match" }`
   - `{ status: "error" }` → 500 `{ error: "generation_failed" }`

### Success Criteria

#### Automated Verification

- `pnpm run build` passes (full project, including the new route)
- `pnpm run lint` passes

#### Manual Verification

- `POST /api/generate` with a valid session and body `{ "meal_type": "dinner", "max_prep_time_minutes": 30 }` → 200 with a valid `MealRecipe` in the response body
- `POST /api/generate` without a session → 401
- `POST /api/generate` with an empty body `{}` → 400 with a validation error message
- `POST /api/generate` with `{ "meal_type": "dinner", "max_prep_time_minutes": 30 }` for a user with an empty pantry → 200 `{ recipe: null, reason: "no_match" }`
- Supabase Studio → `generation_history` table → a new row with correct `name`, `meal_type`, and recipe JSONB matches the API response
- `pnpm run build && pnpm run preview` → same POST test passes on the workerd runtime (validates Cloudflare Workers compatibility)

**Implementation Note**: After completing this phase and all automated and manual verification
passes, the feature is complete and ready for code review.

---

## Testing Strategy

### Manual Testing Steps

1. Start `pnpm run dev`; log in as a test user.
2. Add 5–8 pantry items via the existing pantry UI (e.g., chicken breast, rice, cherry tomatoes,
   mozzarella, basil).
3. `curl -X POST http://localhost:4321/api/generate -H "Content-Type: application/json" -b <session cookie> -d '{"meal_type":"dinner","max_prep_time_minutes":30}'`
4. Verify response: `{ recipe: { name, prep_time_minutes, ingredients, steps }, history_id }`.
5. Check that every ingredient in `recipe.ingredients` is either in the pantry list or in
   `COOKING_STAPLES`.
6. Open Supabase Studio → `generation_history` → confirm a matching row exists.
7. Test no-match: clear the pantry, repeat the request → `{ recipe: null, reason: "no_match" }`,
   no new row in `generation_history`.
8. Test time constraint: add only slow-cook items to the pantry, request with
   `max_prep_time_minutes: 15` → likely `no_match`.
9. Run `pnpm run build && pnpm run preview` → repeat step 3 against `localhost:4321` (workerd
   port) to confirm workerd compatibility.

### Workerd Compatibility Note

`pnpm run dev` runs on Node.js. The `global_fetch_strictly_public` flag in workerd means the final
gate is `pnpm run build && pnpm run preview`. Do not skip this step before marking the feature
complete.

## Performance Considerations

- GPT-4.1-nano via OpenRouter: TTFT ~120 ms, ~150 t/s → a 300-token recipe arrives in ~2 s total.
- Retry-once worst case: ~4 s. This is within acceptable bounds given the NFR ("visible feedback at
  >1 s") is S-03's responsibility (spinner shown while the request is in flight).
- The pantry fetch is a simple indexed `user_id` query — sub-10 ms.
- No additional caching layer is needed at F-02 scale (<1 000 req/month).

## Migration Notes

No database migrations are needed. All schema, RLS, and trigger logic required by F-02 was
delivered in F-01 (`20260528120000_domain_data_schema.sql`,
`20260528140000_fix_history_prune_ordering.sql`).

## References

- Research: `context/changes/ai-meal-generation/research.md`
- Roadmap: `context/foundation/roadmap.md` (F-02 slice)
- Canonical API pattern: `src/pages/api/pantry/index.ts:1-76`
- Domain types: `src/types.ts:1-33`
- Env schema: `astro.config.mjs:17-22`
- History table + prune trigger: `supabase/migrations/20260528120000_domain_data_schema.sql:62-104`
- Infrastructure recommendation: `context/foundation/infrastructure.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — Packages, Env, Types

#### Automated

- [x] 1.1 `pnpm run build` passes without type errors after package install and type additions — 44bfcf7
- [x] 1.2 `pnpm run lint` passes — 44bfcf7

#### Manual

- [x] 1.3 `OPENROUTER_API_KEY` visible in TypeScript IntelliSense from `astro:env/server` — 44bfcf7
- [x] 1.4 `GenerateRequest`, `GenerateResponse`, `GenerationResult` importable from `@/types` — 44bfcf7

### Phase 2: Generation Service

#### Automated

- [x] 2.1 `pnpm run build` compiles `src/lib/generation.ts` without type errors
- [x] 2.2 `pnpm run lint` passes

#### Manual

- [x] 2.3 `generateMeal` returns `{ status: "ok", recipe: {...} }` for a 5-item pantry via `pnpm run dev`
- [x] 2.4 `generateMeal` returns `{ status: "no_match" }` for an empty pantry (no LLM call)
- [x] 2.5 Staples in returned recipe do not trigger pantry validation failure

### Phase 3: API Route

#### Automated

- [ ] 3.1 `pnpm run build` passes (full project including new route)
- [ ] 3.2 `pnpm run lint` passes

#### Manual

- [ ] 3.3 `POST /api/generate` with valid session → 200 with valid `MealRecipe` and `history_id`
- [ ] 3.4 `POST /api/generate` without session → 401
- [ ] 3.5 `POST /api/generate` with empty body → 400
- [ ] 3.6 `POST /api/generate` with empty pantry → 200 `{ recipe: null, reason: "no_match" }`
- [ ] 3.7 Supabase Studio → `generation_history` → new row matches API response
- [ ] 3.8 `pnpm run build && pnpm run preview` → POST test passes on workerd runtime
