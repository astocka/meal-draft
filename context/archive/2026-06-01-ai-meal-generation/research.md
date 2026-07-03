---
date: 2026-06-01
researcher: AI agent
git_commit: c2a7e1e1a6953e22c429b7e2afd9efb1bd10eeb5
branch: main
repository: meal-draft
topic: "F-02 AI meal generation — codebase readiness and integration surface"
tags:
  [
    research,
    codebase,
    ai-meal-generation,
    supabase,
    cloudflare-workers,
    api-routes,
    llm-providers,
    history-logging,
    prompt-strategy,
    structured-output,
    vercel-ai-sdk,
    openrouter,
  ]
status: complete
last_updated: 2026-06-01
last_updated_by: AI agent
last_updated_note: "Added follow-up implementation readiness audit — 22/22 claims CONFIRMED, F-02 cleared for implementation"
---

# Research: F-02 AI Meal Generation — Codebase Readiness

**Date**: 2026-06-01
**Git Commit**: c2a7e1e1a6953e22c429b7e2afd9efb1bd10eeb5
**Branch**: main
**Repository**: meal-draft

## Research Question

What does the existing codebase look like at the F-02 starting line? What schema, types, API patterns, and infrastructure are in place, and what gaps must F-02 close?

## Summary

The codebase is well-prepared for F-02. The DB schema (F-01) defines all three domain tables with correct shapes and RLS. The TypeScript types in `src/types.ts` already model `MealRecipe`, `MealType`, and `GenerationHistoryEntry`. The pantry CRUD implementation establishes the exact API route pattern to copy. The only things missing are: an LLM provider decision, an API key added to env/secrets, and the generation API route + service logic itself. No migration work is needed for F-02.

**Key open question for planning:** Which LLM provider? `infrastructure.md` recommends OpenRouter; `supabase/config.toml` references `OPENAI_API_KEY` for local Supabase AI only (not the app). The project has `has_ai: true` in tech-stack but no AI SDK in `package.json` yet.

---

## Detailed Findings

### 1. Database schema (F-01 — complete)

All three tables are live with correct shapes. F-02 reads from `pantry_products` and writes to `generation_history`.

**`public.pantry_products`** — the generation input source:

| Column       | Type                           | Notes                                |
| ------------ | ------------------------------ | ------------------------------------ |
| `id`         | uuid PK                        |                                      |
| `user_id`    | uuid FK → `auth.users` CASCADE |                                      |
| `name`       | text NOT NULL                  | Unique per user: `lower(trim(name))` |
| `created_at` | timestamptz                    |                                      |
| `updated_at` | timestamptz                    | auto-set via trigger                 |

Reference: `supabase/migrations/20260528120000_domain_data_schema.sql:9-15`

**`public.generation_history`** — the generation output sink:

| Column         | Type                           | Notes                                                       |
| -------------- | ------------------------------ | ----------------------------------------------------------- |
| `id`           | uuid PK                        |                                                             |
| `user_id`      | uuid FK → `auth.users` CASCADE |                                                             |
| `name`         | text NOT NULL                  | Dish name for list views                                    |
| `meal_type`    | `public.meal_type` enum        | `'breakfast' \| 'lunch' \| 'dinner'`                        |
| `generated_at` | timestamptz                    | auto `now()`                                                |
| `recipe`       | jsonb **NULLABLE**             | Full `MealRecipe`; nullable allows logging a failed attempt |
| `seq`          | bigint GENERATED IDENTITY      | Tie-breaker for prune ordering                              |

Reference: `supabase/migrations/20260528120000_domain_data_schema.sql:62-71`,  
`supabase/migrations/20260528140000_fix_history_prune_ordering.sql:4-5`

**Prune trigger:** After every INSERT, `prune_generation_history()` (SECURITY DEFINER) keeps the 20 newest rows per user ordered by `(generated_at DESC, seq DESC)`. INSERT-only history; no UPDATE/DELETE grants for `authenticated` role.

**`public.favorite_meals`** — F-02 does not write here, but the JSONB CHECK constraint defines the canonical recipe shape that generation must satisfy:

```sql
recipe ? 'name'
AND recipe ? 'prep_time_minutes'
AND recipe ? 'ingredients'
AND recipe ? 'steps'
AND jsonb_typeof(recipe -> 'ingredients') = 'array'
AND jsonb_typeof(recipe -> 'steps') = 'array'
```

Reference: `supabase/migrations/20260528120000_domain_data_schema.sql:46-53`

**RLS summary:**

| Table                | SELECT | INSERT | UPDATE | DELETE |
| -------------------- | ------ | ------ | ------ | ------ |
| `pantry_products`    | ✓ own  | ✓ own  | ✓ own  | ✓ own  |
| `generation_history` | ✓ own  | ✓ own  | —      | —      |
| `favorite_meals`     | ✓ own  | ✓ own  | —      | ✓ own  |

All policies: `TO authenticated`, `(select auth.uid()) = user_id`.

---

### 2. TypeScript types (already modeling the generation domain)

`src/types.ts` (34 lines) already has everything needed:

```typescript
// src/types.ts:1-33
export type MealType = "breakfast" | "lunch" | "dinner";

export interface MealRecipe {
  name: string;
  prep_time_minutes: number;
  ingredients: string[];
  steps: string[];
}

export interface GenerationHistoryEntry {
  id: string;
  user_id: string;
  name: string;
  meal_type: MealType;
  generated_at: string;
  recipe: MealRecipe | null;
  readonly seq?: number;
}
```

`MealRecipe` matches the DB CHECK constraint on `favorite_meals.recipe` exactly. `GenerationHistoryEntry` mirrors the `generation_history` table row.

**Gaps — types not yet in `src/types.ts`:**

- `GenerateRequest` DTO: `{ meal_type: MealType; max_prep_time_minutes: number | null }`
- `GenerateResponse` DTO: `{ recipe: MealRecipe; history_id: string }`
- Error union type for generation-specific failures (no match, provider error, etc.)

---

### 3. Supabase client wiring

`src/lib/supabase.ts:4-23` — `createClient(requestHeaders: Headers, cookies: AstroCookies)` returns a configured SSR client or `null` if env vars are absent. Every API handler must call this itself (not reuse the middleware instance) to ensure cookies are refreshed correctly.

`src/middleware.ts:10-18` — resolves user via `supabase.auth.getUser()` and attaches to `context.locals.user`. **`/api/*` routes are NOT protected by middleware** — auth is per-handler.

---

### 4. Canonical API route pattern (pantry as reference)

`src/pages/api/pantry/index.ts` is the reference to copy for the generation endpoint. The pattern:

```typescript
export const prerender = false;  // required

export const POST: APIRoute = async (context) => {
  // 1. Auth guard
  const user = context.locals.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Supabase client
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // 3. Parse body
  let body: unknown;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // 4. Zod validation
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // 5. Business logic
  // 6. DB error mapping (23505 → 409, PGRST116 → 404) → 500 fallback
  // 7. Success response
  return Response.json({ ... }, { status: 200 });
};
```

Reference: `src/pages/api/pantry/index.ts:1-76`, `src/pages/api/pantry/[id].ts:1-80`

Shared Zod validators live in `src/lib/` (e.g. `src/lib/pantry-name.ts`). Follow the same pattern for a `src/lib/generation-schema.ts` or similar.

---

### 5. Existing UI surface for generation

`src/components/MealGeneratorPlaceholder.astro` — 13-line static placeholder, no props. This is what F-02 does NOT replace (that is S-03's job). F-02 is purely server-side: the generation API endpoint and its service logic.

`src/pages/dashboard.astro:9-24` — server-side prefetch of pantry for `PantryWidget`. The same pattern (Supabase query in Astro frontmatter, passing `initialItems` as prop) will be reused or extended in S-03 when the generator becomes interactive.

`context/foundation/dashboard-layout.md` — defines the planned mobile tab pattern for S-03: `Pantry | Meal Generator` tabs on `< 768px`. F-02 does not touch the UI; this is noted here because S-03 planning must factor it in.

---

### 6. Infrastructure and LLM provider

**`wrangler.jsonc`** — no `ai` binding, no `[vars]`, no external service bindings. `compatibility_flags` includes `"nodejs_compat"` and `"global_fetch_strictly_public"`.

**`astro.config.mjs`** — env schema declares only `SUPABASE_URL`, `SUPABASE_KEY`, `SITE_URL`. No AI API key declared.

**`package.json`** — no AI SDK (`openai`, `@ai-sdk/*`, `@anthropic-ai/sdk`, etc.) installed.

**`context/foundation/infrastructure.md`** — explicitly recommends **OpenRouter** as the AI provider for routing across multiple models. Pre-mortem section calls out "workerd/AI latency risk" as a known concern.

**`tech-stack.md`** — `has_ai: true` was set at scaffold time; implementation is not wired yet.

**Two viable integration paths for planning:**

| Path                                                           | How                                                                                               | Pros                                | Cons                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| **External API via `fetch`** (e.g. OpenRouter / OpenAI direct) | Add API key as Wrangler secret + `astro:env/server` field; call with `fetch` in the route handler | No new SDK; infra.md recommendation | Slightly more prompt/response parsing boilerplate          |
| **Cloudflare Workers AI binding**                              | Add `"ai": { "binding": "AI" }` to `wrangler.jsonc`; use `env.AI.run(...)`                        | No external API key; zero-egress    | Limited model selection; Cloudflare-only; harder local dev |

OpenRouter (external fetch) aligns with `infrastructure.md` and avoids Cloudflare-only lock-in. This is the recommended default for planning.

---

### 7. PRD business logic constraints

The generation rule (PRD Business Logic, lines 173–179):

- **Input:** declared pantry names (list of strings) + time preset (`null` = "Any time", or `max_prep_time_minutes: number`) + meal type
- **Output:** exactly one `MealRecipe` — `{ name, prep_time_minutes, ingredients[], steps[] }`
- **Hard constraints (zero-tolerance):**
  - All `ingredients` must be from the user's pantry — no substitution, no extras
  - `prep_time_minutes ≤ max_prep_time_minutes` when a preset is chosen
  - `meal_type` matches the selected type
- **"Any time" / null:** means no time restriction
- **No match:** return a clear message to the user — not an error, not an empty screen (PRD US-01 AC)
- **Session exclusion (FR-010):** excluded names passed in the request body; F-02 foundation must support accepting an `exclude_names: string[]` parameter so S-04 ("Try another") can use the same endpoint

**NFR:** visible feedback for operations > 1 second. The LLM call will exceed this on almost every request; the UI layer (S-03) must show a loading state. F-02 must not artificially block — the API endpoint should stream or return promptly.

**Time budget presets** — **Resolved** (PRD Open Question #2): S-03 exposes **15 / 30 / 60 min** plus **"Any time"** (`max_prep_time_minutes: null`). Default selection: **30 min**. F-02 accepts `max_prep_time_minutes: number | null` (preset-agnostic); S-03 maps UI buttons to `15`, `30`, `60`, or `null`.

---

## Code References

| File                                                                    | Purpose                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/types.ts:1-33`                                                     | All domain types; `MealRecipe`, `MealType`, `GenerationHistoryEntry` |
| `src/lib/supabase.ts:4-23`                                              | `createClient` — must be called per-handler                          |
| `src/middleware.ts:1-33`                                                | User resolution; `/api/*` not middleware-protected                   |
| `src/pages/api/pantry/index.ts:1-76`                                    | Canonical JSON API pattern to copy                                   |
| `src/pages/api/pantry/[id].ts:1-80`                                     | PATCH/DELETE variant of the pattern                                  |
| `src/lib/pantry-name.ts:1-14`                                           | How shared Zod validators are extracted to `src/lib/`                |
| `src/pages/dashboard.astro:9-24`                                        | Server-prefetch pattern for pantry data                              |
| `src/components/MealGeneratorPlaceholder.astro`                         | Static placeholder F-02 does NOT replace                             |
| `astro.config.mjs:17-22`                                                | env schema — where to add `OPENROUTER_API_KEY` (or equivalent)       |
| `wrangler.jsonc:1-15`                                                   | Cloudflare config — where to add AI binding if using Workers AI      |
| `supabase/migrations/20260528120000_domain_data_schema.sql:62-104`      | `generation_history` table + prune trigger                           |
| `supabase/migrations/20260528140000_fix_history_prune_ordering.sql:4-8` | `seq` tie-breaker column + composite index                           |
| `context/foundation/infrastructure.md`                                  | OpenRouter recommendation + latency pre-mortem                       |
| `context/foundation/dashboard-layout.md`                                | Mobile tab pattern planned for S-03                                  |

---

## Architecture Insights

1. **No service layer yet.** Supabase calls live directly in API route handlers (same as pantry). F-02 may want to introduce `src/lib/generation.ts` to isolate: (a) pantry fetch, (b) LLM prompt construction, (c) response validation, (d) history insert. This makes the route handler thin and testable in isolation.

2. **Strict-pantry validation must happen server-side.** The LLM cannot be trusted to self-enforce pantry constraints. The implementation must re-check that every ingredient in the returned recipe exists in the user's fetched pantry (case-insensitive, trimmed). Reject and retry or return "no match" if the check fails.

3. **History insert is append-only.** `generation_history` has SELECT + INSERT RLS only. The prune trigger handles retention (N=20). F-02 inserts a row after a successful generation. `recipe` is nullable — consider whether to insert on "no match" responses (logged with `recipe: null`).

4. **`exclude_names` for "Try another" (S-04).** Design the request schema to accept `exclude_names: string[]` from day one. It costs nothing at F-02 and avoids a breaking API change when S-04 ships.

5. **`global_fetch_strictly_public` flag** in `wrangler.jsonc` means `fetch()` can only reach public internet addresses from Workers. OpenRouter / OpenAI are public — this is fine. Local Supabase dev URLs (127.0.0.1) are NOT reachable from workerd; use `astro dev` (Node.js) for local LLM testing or ensure `.dev.vars` points to a hosted Supabase instance.

6. **Latency.** LLM round trips typically take 2–10 seconds. The NFR requires visible feedback at >1 second. The generation API should return as fast as possible (no double round-trips). Consider a simple retry-once on strict-pantry validation failure before returning "no match".

---

## Historical Context (from prior changes)

- `context/changes/domain-data-schema/plan.md` — F-01 established `generation_history.recipe` as nullable jsonb intentionally (to allow logging partial/failed generations). The `seq` tie-breaker was added post-plan in an addendum after an impl-review finding.
- `context/changes/domain-data-schema/reviews/impl-review.md` — Verdict `NEEDS ATTENTION`; issues were resolved via addendum. The CHECK constraint on `favorite_meals.recipe` was added here and defines the canonical recipe JSON shape F-02 must produce.
- `context/changes/pantry-crud/plan.md` — S-02 confirmed: pantry is name-only for v1 (no quantity, no unit). Generation receives ingredient names as strings only.

---

## Related Research

No prior `research.md` files exist in `context/changes/` or `context/archive/` for generation.

---

---

## 8. LLM Provider and Model Research

**Research date**: 2026-06-01 · **Method**: web_search_exa across Groq, OpenRouter, Google AI, Cloudflare Workers AI pricing and benchmark pages.

### Task profile

F-02 generates a single `MealRecipe` JSON (~300–500 output tokens) from a ~200–400 token input (system prompt + pantry list + constraints). The workload is:

- **Output size**: small (JSON object with 4 fields; ingredients array ~5–10 strings, steps ~5–8 strings)
- **Latency budget**: the NFR requires visible feedback at >1 s; the LLM call will exceed 1 s on most providers — streaming is not required but the API must return promptly
- **Volume (MVP)**: ~100–1 000 requests/month — cost is noise at this scale; reliability and strict-pantry compliance matter more
- **Structured output requirement**: provider must support either `json_schema` enforcement or `json_object` mode. Server-side re-validation is always required regardless

### Constraint: Cloudflare Workers runtime

All LLM calls originate from the workerd runtime. The `global_fetch_strictly_public` flag is active. This means:

- `fetch()` to any public HTTPS endpoint works fine (OpenRouter, Groq, OpenAI, Google AI Studio)
- No native Node.js TLS/TCP internals — use only `fetch`-based SDKs
- The `openai` npm SDK is confirmed compatible with Workers (uses `fetch` internally)
- The Vercel AI SDK (`ai` + `@ai-sdk/*`) is also confirmed compatible; it uses `fetch` underneath and has an official Cloudflare docs page

---

### Provider comparison

#### 1. Groq (direct API)

| Model                     | Input $/1M | Output $/1M | TTFT        | TPS | JSON mode     |
| ------------------------- | ---------- | ----------- | ----------- | --- | ------------- |
| `llama-3.1-8b-instant`    | $0.05      | $0.08       | ~150 ms     | 840 | `json_object` |
| `llama-4-scout-17b`       | $0.11      | $0.34       | ~150 ms     | 594 | `json_object` |
| `llama-3.3-70b-versatile` | $0.59      | $0.79       | ~150–200 ms | 394 | `json_object` |

**Notes**: Groq runs custom LPU hardware. TTFT is measured at ~38 ms (p50 warm) to ~150 ms in published benchmarks — the fastest of any cloud provider. Tokens/second far exceeds GPU-based APIs (5–14× faster). API is OpenAI-compatible (`baseURL: "https://api.groq.com/openai/v1"`). Supports `response_format: { type: "json_object" }` but **not** `json_schema` schema enforcement — you get valid JSON but not schema-validated output. Prompt discipline + server-side Zod validation required. Free tier: 30 RPM / 6 000 TPM / 14 400 RPD, no credit card.

**For MealDraft F-02 (300-token recipe):**

- `llama-3.1-8b-instant` at 840 TPS → recipe generates in ~0.35 s after first token. Total round trip ~0.5 s. Effectively instant.
- 1 000 monthly requests × avg 600 tokens = 600 K tokens → **$0.033/month** on 8B.
- Risk: 8B model may not reliably honour strict-pantry constraints. Retry logic or server-side pantry check is mandatory.

---

#### 2. OpenRouter (recommended by `infrastructure.md`)

OpenRouter aggregates 400+ models behind one OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`). 5.5% fee on credits; no per-inference markup. `sort: "throughput"` (`:nitro` variant) routes each request to the fastest provider for that model.

**Best models for F-02 via OpenRouter:**

| Model                      | Input $/1M | Output $/1M | TTFT (approx) | json_schema?       |
| -------------------------- | ---------- | ----------- | ------------- | ------------------ |
| `openai/gpt-4.1-nano`      | $0.10      | $0.40       | ~120 ms       | **Yes**            |
| `openai/gpt-4.1-mini`      | $0.40      | $1.60       | ~200 ms       | **Yes**            |
| `meta-llama/llama-4-scout` | $0.11      | $0.34       | ~150 ms       | `json_object` only |
| `google/gemini-2.5-flash`  | $0.30      | $2.50       | ~640 ms       | **Yes**            |
| `x-ai/grok-4.1-fast`       | $0.20      | $0.50       | ~130 ms       | Yes                |
| `deepseek/deepseek-v3`     | ~$0.30     | ~$0.89      | ~2 000 ms     | `json_object`      |

**GPT-4.1 Nano** is the standout: cheapest provider with first-class `json_schema` enforcement, sub-200 ms TTFT, and the strongest instruction-following-per-dollar. 1M context window covers any realistic pantry prompt. 1 000 monthly requests → **$0.02–$0.05/month** (negligible).

**DeepSeek V3** looks cheap but has a 2 s TTFT from EU/US due to China-hosted servers — unacceptable for interactive generation without streaming.

**Grok 4.1 Fast** at $0.20/$0.50 per 1M is fast and cheap, supports structured output, but is a newer model with less community validation on food/recipe tasks.

---

#### 3. Google AI Studio (direct API)

| Model                                        | Input $/1M | Output $/1M | TTFT    | TPS  | json_schema? |
| -------------------------------------------- | ---------- | ----------- | ------- | ---- | ------------ |
| `gemini-2.5-flash`                           | $0.30      | $2.50       | ~640 ms | ~225 | **Yes**      |
| `gemini-2.5-flash-8b` (Flash-Lite successor) | $0.075     | $0.30       | ~100 ms | ~180 | **Yes**      |

Google AI Studio offers a **generous free tier** (requests/day, no credit card). `gemini-2.5-flash-8b` at $0.075/$0.30 is the cheapest option with `json_schema` enforcement. TTFT ~100 ms. For a 300-token recipe at 180 TPS → ~1.7 s total (TTFT + generation). Acceptable under the NFR.

⚠️ Gemini 2.0 Flash and 2.0 Flash-Lite are **deprecated as of June 1, 2026** (today) — do not target these.

---

#### 4. Cloudflare Workers AI (binding, no external API key)

| Model                                      | Input $/1M | Output $/1M | JSON mode     | Free neurons/day              |
| ------------------------------------------ | ---------- | ----------- | ------------- | ----------------------------- |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast`  | $0.045     | $0.384      | `json_schema` | 10 000 neurons (~200 req/day) |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293     | $2.253      | `json_schema` | same pool                     |

Workers AI runs on Cloudflare's edge, co-located with the Worker. Zero external network hop. Configured via `wrangler.jsonc` `"ai": { "binding": "AI" }` — no API key needed. Supports `json_schema` mode (GA since Feb 2025). Also integrates with the Vercel AI SDK via `workers-ai-provider`.

**Limitations**:

- Free tier is ~200 LLM requests/day on 8B models (10 000 neurons ÷ ~50 neurons/call). Not suitable for production traffic beyond prototyping.
- `json_schema` compliance is best-effort: Cloudflare docs note the model "may not satisfy the request in extreme situations" and returns `JSON Mode couldn't be met` error that must be handled.
- Model selection is narrower than external providers; quality for complex reasoning is lower than GPT-4.1 Nano or Gemini 2.5 Flash.

---

### SDK integration path

All three external options (Groq, OpenRouter, Google) are OpenAI-compatible. The two viable integration patterns for Cloudflare Workers:

| Pattern                                     | Dependencies           | Bundle impact | Structured output                          |
| ------------------------------------------- | ---------------------- | ------------- | ------------------------------------------ |
| **Plain `fetch`**                           | none                   | zero          | Manual `response_format` JSON parsing      |
| **`openai` npm SDK**                        | `openai`               | ~80 KB        | `response_format: { type: "json_schema" }` |
| **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) | `ai`, `@ai-sdk/openai` | ~150 KB       | `generateObject` with Zod schema           |

The Vercel AI SDK has first-class Cloudflare Workers support (official docs page), Zod-native schema binding, and a `workers-ai-provider` package for the CF binding path. It would remove manual JSON parsing and align with the existing Zod usage pattern in the codebase. The `openai` SDK is lighter and sufficient if using plain `response_format`.

---

### Recommendation

**Primary (OpenRouter + GPT-4.1 Nano)** — aligns with `infrastructure.md`, gives `json_schema` enforcement, lowest cost with proper schema validation, fastest TTFT with reliable instruction following.

| Property                      | Value                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Provider                      | OpenRouter                                                      |
| Model                         | `openai/gpt-4.1-nano`                                           |
| Input cost                    | $0.10 / 1M tokens                                               |
| Output cost                   | $0.40 / 1M tokens                                               |
| Est. monthly cost (1 000 req) | < $0.05                                                         |
| TTFT                          | ~120 ms                                                         |
| TPS                           | ~150 t/s → ~2 s for a 300-token recipe                          |
| json_schema                   | Yes — enforces `MealRecipe` shape                               |
| Cloudflare Workers compat     | Yes — `fetch`-based                                             |
| Env var                       | `OPENROUTER_API_KEY` as Wrangler secret                         |
| SDK                           | `openai` npm SDK with `baseURL: "https://openrouter.ai/api/v1"` |

**Budget / speed alternative (Groq + Llama 3.1 8B Instant)** — 10× cheaper, fastest TTFT (~150 ms), but `json_object` mode only (no schema enforcement). Requires robust server-side pantry re-validation and retry logic. Viable if quality testing passes.

**No-external-key option (Cloudflare Workers AI)** — for local dev without an API key. Switch to external API before shipping. Free tier (~200 req/day) too small for production.

**Do not use**: Gemini 2.0 Flash / Flash-Lite (deprecated June 1, 2026), DeepSeek V3 direct (2 s TTFT).

---

---

## 9. History Logging Strategy for "No Match" and Failed Generations

**Research date**: 2026-06-01 · **Method**: web_search_exa across observability, audit-log architecture, UX failure-state design, and Supabase RLS patterns.

### The question in full

`generation_history.recipe` is `jsonb NULLABLE`. The schema allows inserting a row with `recipe = null` to log a generation attempt that produced no valid result. Open Question #2 asks: should F-02 insert such rows for (a) "no match" outcomes (pantry has no valid combination for the given constraints) and/or (b) provider/parsing errors? The decision has three downstream effects:

1. **Prune trigger**: `prune_generation_history()` keeps the 20 newest rows per user ordered by `(generated_at DESC, seq DESC)` — total rows, not only rows with a recipe. Null-recipe rows count toward the 20-row cap and could displace successful recipes from the user's visible history.
2. **S-06 history UI**: if null rows exist in the table, S-06 must filter `WHERE recipe IS NOT NULL` to avoid rendering empty history entries. That's a query-time coupling this schema does not impose today.
3. **Debugging value**: null rows provide a structured record of failure frequency and context. But at MVP scale, Cloudflare Workers logs (`console.error` + `wrangler tail`) provide the same signal at zero schema cost.

---

### The industry pattern: separate internal observability from user-visible history

Every auditing and observability reference reaches the same structural conclusion: **a user-visible history list and an internal operations log are different artefacts with different audiences, different access patterns, and different retention needs, and conflating them into one table creates coupling that grows expensive over time.**

From Martin Fowler's _Audit Log_: an audit log records "any time something significant happens" — including failures. From the Veld Systems audit-log guide: "Not logging failures [is a mistake]. Failed login attempts, denied permission checks, and validation errors are often more important for security investigations than successful operations." From the AI observability literature (2026): LLM "no result" events — model refusals, empty outputs, schema violations — are first-class operational signals that must be captured to detect prompt drift and degradation.

At the same time, the NNGroup empty-state and AI-UX failure-mode research is equally clear: users should **never** see blank or meaningless entries in a history list. A "no match" attempt that shows up as an empty row in S-06 creates confusion about system status and erodes trust. The UX recommendation is to show failure states in-context (at the time of generation, not in the history list), offer a path forward, and then drop the failed attempt from the permanent record.

The recommended architecture when these two needs collide: **two distinct tables** — one for user-visible history (successful results only), one for internal operational logs (all attempts including failures). In CQRS terms: the user-visible history is a read-projection optimised for the user; the operational log is the full event stream optimised for debugging.

---

### Why the single-table approach is problematic for MealDraft specifically

The `generation_history` table was designed as a **user-facing feature** (S-06 renders it). The prune trigger already enforces a UX contract: show the 20 most recent successful meals. Inserting null-recipe rows into this same table creates four concrete problems:

| Problem                                                     | Consequence                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Null rows count toward the 20-row prune cap                 | A user who hits "no match" 10 times in a row loses 10 of their 20 available history slots; successful recipes are pruned faster |
| S-06 must filter `WHERE recipe IS NOT NULL`                 | Any query, view, or future API that reads history inherits this filter requirement; missed filters expose null rows to users    |
| Prune trigger must be updated to exclude nulls from the cap | Otherwise the UX contract (20 recent meals) is silently broken                                                                  |
| Debugging signal and UX history become coupled              | Changing retention policy for one breaks the other                                                                              |

Fixing these requires either (a) modifying the prune trigger to count only `recipe IS NOT NULL` rows toward the cap, and (b) adding `WHERE recipe IS NOT NULL` to every S-06 read path — essentially building the separation manually inside one table, which is harder to maintain than just using two tables.

---

### Recommendation: two distinct failure types, two distinct logging strategies

F-02 encounters two different "non-success" outcomes. The recommended approach is different for each:

#### Outcome A — Semantic "no match" (pantry has no valid combination for constraints)

**Do not insert a history row.** Return a structured response to the caller without any DB write:

```typescript
// API response shape for no-match
{ recipe: null, reason: "no_match" }  // HTTP 200 with null recipe field
```

The PRD already specifies that "no match" should produce "a clear message to the user — not an error, not an empty screen." That message is a UI concern (S-03), not a persistence concern. There is no user value in seeing past no-match attempts in the history list; they did not generate a meal. Log to `console.warn` with the constraints for operational visibility via `wrangler tail`.

#### Outcome B — Technical/provider failure (LLM error, malformed JSON, server-side pantry validation failure after retry)

**Insert `recipe: null` only after retry is exhausted AND only if the pantry was non-empty.** A provider error on an empty pantry is just a validation error — don't log it. A provider error after retry on a valid pantry is worth logging: it tells you whether the model is drifting or the provider is unstable.

The row shape for this case:

```typescript
await supabase.from("generation_history").insert({
  user_id: user.id,
  name: "[generation failed]", // sentinel name, not user-visible in S-06
  meal_type: input.meal_type,
  recipe: null,
  // generated_at is auto-set by now()
});
```

S-06 history UI queries: `WHERE recipe IS NOT NULL` to exclude these sentinel rows from the rendered list. The prune trigger does not need modification because technical failures should be rare — the 20-row cap pressure remains negligible.

#### Summary table

| Outcome                          | DB insert?                                              | Response to caller                        | Operational log                  |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| Semantic "no match"              | **No**                                                  | `{ recipe: null, reason: "no_match" }`    | `console.warn` → `wrangler tail` |
| Provider/parse error after retry | **Yes** (`recipe: null`, `name: "[generation failed]"`) | `{ error: "generation_failed" }` HTTP 500 | `console.error` + DB row         |
| Successful generation            | **Yes** (full recipe)                                   | `{ recipe: MealRecipe, history_id }`      | implicit in DB row               |

---

### Impact on S-06 and the prune trigger

**Prune trigger**: no migration needed. Null-recipe rows from provider failures will be rare enough not to materially affect the 20-row cap. If failure rates grow, a future migration can amend `prune_generation_history()` to prioritise `recipe IS NOT NULL` rows. That migration is deferred, not skipped.

**S-06 history UI** (future slice): query must include `WHERE recipe IS NOT NULL`. Establish this as a convention in `src/lib/generation.ts` by exporting a typed `generationHistorySelect` helper that includes the filter, so S-06 picks it up naturally rather than re-implementing the guard.

**`name` sentinel for failed rows**: the column is NOT NULL. The sentinel string `"[generation failed]"` keeps the constraint satisfied and is visually distinct if ever exposed by accident. A CHECK constraint could enforce this format if desired, but is not required for F-02.

---

### What this means for F-02 implementation

1. `generateMeal()` service function returns a discriminated union: `{ type: "success", recipe, historyId }` | `{ type: "no_match" }` | `{ type: "error" }`.
2. The API route maps these to appropriate HTTP responses.
3. The service inserts into `generation_history` only on `"success"` and `"error"` (after retry) outcomes.
4. No schema migration needed — the nullable `recipe` column and the existing RLS already support this pattern.
5. Add `console.warn` on no-match with `{ userId: hash, meal_type, max_prep_time_minutes, pantry_size }` for operational monitoring without PII exposure.

---

## 10. Prompt Strategy for Structured JSON Meal Generation

**Research date**: 2026-06-01 · **Method**: web_search_exa across OpenRouter structured output docs, Vercel AI SDK docs, LLMStructBench benchmark (arXiv 2602.14743), production prompt-engineering guides (unblockdevs.com, thepromptbench.com, dev.to).

### The question in full

Open Question #3: Zero-shot with a strict system prompt? Few-shot with example recipes? JSON mode (if provider supports it)? What is the fallback strategy on malformed LLM output?

---

### Recommended approach: PJ+ zero-shot via `generateObject`

The research evidence from 2025–2026 converges on a single combination for production-grade structured output on modern instruction-tuned models:

> **PJ+ strategy + zero-shot + Vercel AI SDK `generateObject` + OpenRouter `@openrouter/ai-sdk-provider` + Response Healing fallback + Zod validation gate.**

Each component is justified below.

---

### 1. Why JSON schema enforcement (not prompt-only JSON mode)

Prompt-only instructions ("respond only in valid JSON") fail in production. LLMs add explanatory preamble, use code fences, insert trailing commas, or deviate from the schema when they "think" a different format is more helpful. The 2026 unblockdevs.com guide quantifies the gap:

| Approach                                                 | Reliability |
| -------------------------------------------------------- | ----------- |
| Prompt-only ("respond in JSON")                          | ~70%        |
| `json_object` mode (syntactically valid JSON, no schema) | ~90%        |
| `json_schema` with `strict: true` (constrained decoding) | ~99.9%      |

OpenRouter fully supports `response_format: { type: "json_schema", strict: true }` for all OpenAI GPT-4.x models (including the recommended `openai/gpt-4.1-nano`), Google Gemini, Anthropic Claude Sonnet 4.5+, and most open-source models. To guarantee only schema-capable providers are routed to, set `require_parameters: true` in the `provider` preferences object:

```typescript
// force OpenRouter to only route to providers that support json_schema
provider: {
  require_parameters: true;
}
```

---

### 2. PJ+ strategy: schema in API params AND system prompt

The LLMStructBench benchmark (arXiv 2602.14743, 2026) evaluated five prompt configurations across dozens of model families. The two most reliable strategies were:

| Tag     | API `response_format` | System prompt         | Best for                                                      |
| ------- | --------------------- | --------------------- | ------------------------------------------------------------- |
| **P**   | not set               | Schema + example JSON | well-aligned large models (Gemma 12B+, LLaMA 70B, Qwen 1.7B+) |
| **PJ+** | `json_schema` object  | Schema + example JSON | all models incl. smaller/less reliable ones                   |

For production deployments where model routing can shift (as it does via OpenRouter), **PJ+ is the safer choice**: it sends the schema to the model both through the constrained-decoding API parameter and through a natural-language description in the system prompt. The dual signal is redundant for strong models (no downside) and critical for weaker fallback routes.

The system prompt should include:

- The `MealRecipe` JSON schema described in natural language with field names and types
- The strict-pantry constraint ("use ONLY ingredients from the list below — no substitutions, no additions")
- The prep-time constraint ("total preparation time must not exceed `{max_prep_time_minutes}` minutes")
- A "no match" escape ("if no valid meal exists within these constraints, return `{ \"no_match\": true }` — do not invent ingredients")

---

### 3. Zero-shot — no recipe examples

For strict-format JSON generation on GPT-4o-class models, the research consensus in 2025–2026 is clear: **zero-shot outperforms few-shot** for this task type.

From the dev.to ablation analysis (May 2026):

> "Strict-format instruction-following — 'Output JSON with fields A, B, C; no preamble; no markdown fences.' The schema-and-no-example version works well in Claude 4 and GPT-4o. Add a one-shot example and the model starts copying structural choices from the example: quote style, field order, whether it wrapped the JSON in a code fence. If your example had a trailing newline, half your outputs now have a trailing newline. You hard-coded a defect."

From thepromptbench.com (May 2026):

> "A robust extraction setup is 80% schema, 15% example, 5% prompt wording. Usually one good one is enough if the schema is clear. Use 2–3 when there is an edge case the schema cannot express. Past 3 examples you have probably under-specified the schema."

For MealDraft specifically:

- The `MealRecipe` schema is simple, well-typed, and fully expressible in the Zod/JSON schema — no edge cases that only examples can capture.
- The recipe domain is extremely well-represented in GPT-4.1-nano's training data — the model does not need "what a recipe looks like" demonstrated.
- The strict-pantry constraint is the hard part; an example recipe would anchor to specific ingredients, not help the model reason about pantry constraints.
- Zero-shot costs fewer tokens per request (no example in the prompt), which matters at scale.

**Rule**: if Zod validation failure rates exceed ~2% in production, add a single compressed few-shot example at that point — not before.

---

### 4. Integration: `@openrouter/ai-sdk-provider` + Vercel AI SDK `generateObject`

The officially supported integration pattern for OpenRouter on Cloudflare Workers is:

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

const MealRecipeSchema = z.object({
  name: z.string(),
  prep_time_minutes: z.number().int().positive(),
  ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
});

// Model with Response Healing plugin enabled
const model = openrouter("openai/gpt-4.1-nano", {
  plugins: [{ id: "response-healing" }],
  provider: { require_parameters: true },
});

const { object } = await generateObject({
  model,
  schema: MealRecipeSchema,
  schemaName: "MealRecipe",
  schemaDescription: "A single meal recipe using only the listed pantry ingredients.",
  system: buildSystemPrompt(pantryItems, mealType, maxPrepTime),
  prompt: "Generate exactly one meal recipe.",
});
```

The `@openrouter/ai-sdk-provider` package:

- Wraps OpenRouter's OpenAI-compatible API with full Vercel AI SDK type safety
- Passes `response_format: { type: "json_schema", strict: true }` automatically when you use `generateObject`
- Supports the `plugins` option for Response Healing
- Works on Cloudflare Workers (uses `fetch`, no Node.js-specific APIs)

Install: `pnpm add @openrouter/ai-sdk-provider ai`

---

### 5. Fallback chain for malformed output

Three layers, each catching what the previous missed:

| Layer                           | Mechanism                                          | What it catches                                                                    |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **1 — Constrained decoding**    | OpenRouter `json_schema` + `strict: true`          | Model-level schema violations (~99.9% reliability)                                 |
| **2 — Response Healing plugin** | `plugins: [{ id: 'response-healing' }]`            | Syntax errors: missing brackets, trailing commas, markdown code fences, mixed text |
| **3 — Zod `safeParse`**         | Validate `MealRecipeSchema` after `generateObject` | Semantic violations: wrong types, missing fields, values outside constraints       |

Response Healing only applies to **non-streaming requests**. Since F-02 returns a complete recipe in one shot (not streamed character-by-character to the user), non-streaming is the correct mode.

If Layer 3 (Zod) fails:

- Log `console.error` with the raw model output and the Zod error
- Treat as Outcome B from §9 (technical/provider error): insert `{ recipe: null, name: "[generation failed]" }` into `generation_history`
- Return HTTP 500 `{ error: "generation_failed" }` to the API caller
- The API route (S-03) shows a user-friendly error state

---

### 6. `no_match` signal from the model

When the system prompt instructs the model to return `{ "no_match": true }` for impossible pantry constraints, the Zod schema must handle this discriminated union:

```typescript
const GenerationResultSchema = z.union([z.object({ no_match: z.literal(true) }), MealRecipeSchema]);
```

A `no_match: true` response is **not** a Layer 3 Zod failure — it is a valid structured response. The service maps it to `{ type: "no_match" }` without any DB insert (per §9 recommendation).

---

### What this means for F-02 implementation

1. **Install**: `pnpm add @openrouter/ai-sdk-provider ai`
2. **Secret**: `OPENROUTER_API_KEY` via `wrangler secret put OPENROUTER_API_KEY` (runtime-only, never build-time)
3. **Service file** (`src/lib/generation.ts`):
   - `buildSystemPrompt(pantryItems, mealType, maxPrepTime): string` — constructs the zero-shot system prompt
   - `generateMeal(input): Promise<GenerationResult>` — calls `generateObject`, applies the fallback chain, returns discriminated union
4. **No streaming needed for F-02** — `generateObject` awaits the full response; the API route returns JSON; the UI (S-03) shows a spinner until the response arrives (satisfying the "visible feedback for >1s" NFR)
5. **Provider routing**: `require_parameters: true` ensures OpenRouter never silently falls back to a provider that only supports `json_object` mode

---

## Open Questions

1. ~~**LLM provider and model**~~ — **Resolved**: see §8 above. Recommended: OpenRouter + `openai/gpt-4.1-nano`. Alternative: Groq + `llama-3.1-8b-instant`. Decision needed before implementation starts.

2. ~~**Insert history on "no match"?**~~ — **Resolved**: see §9 above. Do NOT insert for semantic "no match". Insert `recipe: null` only for technical provider errors after retry. S-06 queries must include `WHERE recipe IS NOT NULL`. No migration needed.

3. ~~**Prompt strategy**~~ — **Resolved**: see §10 below. Use **PJ+ strategy**: `response_format: { type: "json_schema", strict: true }` via OpenRouter + schema description in system prompt + zero-shot (no recipe examples). Use `@openrouter/ai-sdk-provider` with `generateObject` from Vercel AI SDK. Fallback chain: OpenRouter Response Healing plugin → Zod `safeParse` → treat failure as technical error (insert `recipe: null`, HTTP 500).

4. ~~**Exact time presets**~~ — **Resolved**: **15 / 30 / 60 min** + **"Any time"** (`null`). Default: **30 min**. F-02 stays preset-agnostic (`max_prep_time_minutes: number | null`); S-03 maps buttons to `15`, `30`, `60`, or `null`. See §7 (PRD business logic constraints).

5. ~~**Service file or inline?**~~ — **Resolved**: see §12 below. Use a dedicated `src/lib/generation.ts` service file. The API route stays thin (parse → call service → return HTTP response). All orchestration logic lives in the service.

---

## §12 — Service file vs inline: decision and rationale

### Question

Should the generation logic (pantry fetch, prompt build, LLM call, Zod validation, history insert) live directly in the API route handler, or be extracted to `src/lib/generation.ts`?

### Research basis

- **Thin controller / thin endpoint principle** (industry-wide, framework-agnostic): API route handlers are adapters between the HTTP layer and business logic. Their only responsibilities are: parse the request, call a service, return a response. All orchestration belongs in a service. Sources: _fiodar.substack.com/p/thin-controller-principle_, _langfuse/langfuse routing-and-controllers.md_.
- **Astro-specific evidence**: The Astro community produces service extraction patterns via `Locals`-based dependency injection (Florian Lefebvre, Loren Stewart). Even without full DI, extracting logic to `src/lib/` plain modules is the lightest correct form of the same principle.
- **Existing project pattern**: `src/lib/pantry-name.ts` already extracts a validation helper out of the API route. `src/lib/supabase.ts` and `src/lib/utils.ts` establish that `src/lib/` is the home for shared, protocol-agnostic logic. The pantry CRUD route (`src/pages/api/pantry/index.ts`) is itself relatively thin — 76 lines covering two operations. Generation has ≥5 distinct operations; keeping them inline would produce a route file 3–5× larger.
- **Cloudflare Workers compatibility**: A plain TypeScript module (`src/lib/generation.ts`) has zero workerd compatibility concerns. It imports `ai` (Vercel AI SDK) and `@openrouter/ai-sdk-provider`, both of which are confirmed compatible with the workerd runtime (fetch-based, no Node.js native bindings).
- **Reuse across slices**: The generation service will be called by S-03 (first suggestion) and S-04 (try another, exclusion list passed in). Inlining logic in the API route makes S-04 require either duplication or a refactor. A service accepts parameters and is called from multiple routes without modification.
- **Type-safe AI integration (Clean Architecture pattern)**: The recommended pattern for Vercel AI SDK + Zod `generateObject` is a typed service function that encapsulates the prompt, schema, provider call, and fallback — exactly what `§11` already describes for `generateMeal()`.

### Decision: dedicated service file

**Use `src/lib/generation.ts`.**

| Concern                              | Service file (`src/lib/`)           | Inline in route                |
| ------------------------------------ | ----------------------------------- | ------------------------------ |
| Astro/Cloudflare compatibility       | ✅ plain TS module, zero risk       | ✅ same                        |
| Route handler size                   | ✅ thin (~30 lines)                 | ❌ ~150+ lines                 |
| Reuse in S-04 (try another)          | ✅ pass exclusion list as param     | ❌ duplicate or refactor       |
| Protocol independence                | ✅ service knows nothing about HTTP | ❌ mixed HTTP + business logic |
| Testability                          | ✅ call service function directly   | ❌ must mock HTTP context      |
| Consistency with existing `src/lib/` | ✅ follows established pattern      | ❌ breaks pattern              |

### Canonical split

**`src/pages/api/generate.ts`** (thin route — HTTP adapter):

- Export `prerender = false`
- Auth guard (from `context.locals.user`)
- Parse + validate request body with Zod
- Call `generateMeal(supabase, userId, input)` from `src/lib/generation.ts`
- Map `GenerationResult` discriminated union → HTTP response codes and JSON body

**`src/lib/generation.ts`** (service — protocol-agnostic):

- `buildSystemPrompt(pantryItems, mealType, maxPrepTime): string`
- `generateMeal(supabase, userId, input, options?): Promise<GenerationResult>` — orchestrates: pantry fetch → prompt build → `generateObject` → Zod validation → history insert → return discriminated union
- `GenerationResult` discriminated union type: `{ status: "ok"; meal: MealRecipe } | { status: "no_match" } | { status: "error"; technicalError: true }`

This split matches `§10`'s already-decided service function signatures and the Vercel AI SDK's design intent for `generateObject`.

---

## Follow-up Research 2026-06-01 — Implementation Readiness Audit

**Question**: Is F-02 fully ready for implementation? Are all prerequisites met, pattern anchors correct, and the codebase free of conflicts?

**Method**: Three parallel sub-agents verified 22 specific claims against the live codebase (commit `c2a7e1e`). Zero mismatches.

### Verdict: CLEARED FOR IMPLEMENTATION ✓

**22 / 22 claims CONFIRMED. No blockers, no missing pieces, no conflicts.**

---

### Area 1 — F-01 Prerequisites (6/6 CONFIRMED)

| Claim                                                                     | File                                                                | Evidence                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `generation_history` table + nullable `recipe` JSONB                      | `supabase/migrations/20260528120000_domain_data_schema.sql:65–72`   | `recipe jsonb` (no NOT NULL) at line 71                                                          |
| INSERT-only RLS on `generation_history` (SELECT+INSERT; no UPDATE/DELETE) | same migration, lines 157–167                                       | `generation_history_select_own` + `generation_history_insert_own`; GRANT SELECT, INSERT line 175 |
| Fix-prune migration exists                                                | `supabase/migrations/20260528140000_fix_history_prune_ordering.sql` | `seq` identity column, `ORDER BY generated_at DESC, seq DESC`, `LIMIT 20`                        |
| 20-row prune trigger                                                      | domain migration lines 78–104                                       | `LIMIT 20` at line 92; trigger `generation_history_prune` AFTER INSERT                           |
| `pantry_products` with `name` + `user_id` columns                         | domain migration lines 9–14                                         | `user_id uuid NOT NULL`, `name text NOT NULL`                                                    |
| DB `meal_type` enum = TS `"breakfast"\|"lunch"\|"dinner"`                 | migration line 3 + `src/types.ts:1`                                 | Exact match                                                                                      |
| `MealRecipe`, `MealType`, `GenerationHistoryEntry` in `src/types.ts`      | `src/types.ts:1,3–8,25–33`                                          | Present                                                                                          |
| `GenerateRequest`, `GenerateResponse`, `GenerationResult` absent          | `src/types.ts` (full)                                               | Not present — Phase 1 adds them correctly                                                        |

---

### Area 2 — Pattern File Anchors (9/9 CONFIRMED)

| Claim                                                                              | File                                 | Evidence                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Pantry API pattern ~76 lines with auth/supabase/json/zod/error-map structure       | `src/pages/api/pantry/index.ts:1–76` | Auth guard lines 13–17, Supabase client 19–22, JSON parse 48–53, Zod 55–58, DB error map 68–72 |
| `astro.config.mjs` `env.schema` at lines 17–22 with 3 existing vars, no OPENROUTER | `astro.config.mjs:17–22`             | Exact match                                                                                    |
| `.env.example` exists, no `OPENROUTER_API_KEY`                                     | `.env.example`                       | 3 lines; OPENROUTER absent                                                                     |
| `src/lib/pantry-name.ts` exists                                                    | `src/lib/pantry-name.ts`             | Exports `pantryNameSchema`, `getPantryNameError`                                               |
| `src/lib/supabase.ts` exports `createClient`                                       | `src/lib/supabase.ts:5–8`            | Returns null if env vars missing                                                               |
| `src/lib/generation.ts` absent                                                     | —                                    | Correctly absent; Phase 2 creates it                                                           |
| `src/lib/generation-schema.ts` absent                                              | —                                    | Correctly absent; Phase 3 creates it                                                           |
| `src/pages/api/generate.ts` absent                                                 | —                                    | Correctly absent; Phase 3 creates it                                                           |
| `global_fetch_strictly_public` in `wrangler.jsonc`                                 | `wrangler.jsonc:6`                   | `"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]`                     |

---

### Area 3 — Environment, Packages, Conflicts (7/7 CONFIRMED)

| Claim                                                            | File                                                 | Evidence                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ai` and `@openrouter/ai-sdk-provider` not in `package.json`     | `package.json:17–59`                                 | Absent from both `dependencies` and `devDependencies`                                          |
| No `src/` imports from AI SDK packages                           | `src/**` grep                                        | Zero matches                                                                                   |
| No generation-related code under `src/pages/api/` or `src/lib/`  | directory listing                                    | Current API routes: auth + pantry only; lib: supabase, utils, pantry-name, config-status, auth |
| `src/middleware.ts` sets `context.locals.user`                   | `src/middleware.ts:17–19`                            | `context.locals.user = user ?? null`; typed in `src/env.d.ts:2–4`                              |
| `MealGeneratorPlaceholder.astro` exists (F-02 does not touch it) | `src/components/meal/MealGeneratorPlaceholder.astro` | Placeholder UI "coming in next step"                                                           |
| `.dev.vars` exists; no `OPENROUTER_API_KEY`                      | `.dev.vars`                                          | 3 vars (SUPABASE_URL, SUPABASE_KEY, SITE_URL) only                                             |
| `pnpm-lock.yaml` present                                         | `pnpm-lock.yaml:1`                                   | `lockfileVersion: '9.0'`, matches `pnpm@11.2.2`                                                |

---

### One Required Pre-Implementation Action

The `OPENROUTER_API_KEY` must be obtained and added in three places before Phase 2 can be tested end-to-end:

1. `.env` (Node dev, for `pnpm run dev`) — added in Phase 1 per the plan
2. `.dev.vars` (workerd local, for `pnpm run preview`) — **not mentioned explicitly in the plan** but required for workerd testing
3. Cloudflare Workers secret (production deploy) — handled separately via Wrangler or dashboard

The plan's Phase 1 only calls out `.env.example` (template) and the `astro.config.mjs` schema declaration. The implementer must also add the key to `.dev.vars` before the Phase 2 workerd gate (`pnpm run build && pnpm run preview`).

### Plan + Review Status

| Artifact                                                    | Status                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `context/changes/ai-meal-generation/plan.md`                | Complete — 3 phases, all findings from plan-review triaged and fixed                                                       |
| `context/changes/ai-meal-generation/reviews/plan-review.md` | SOUND — 4/4 warnings fixed (F1 top-level try/catch, F2 maxRetries:0, F3 z.union pre-flight check, F4 TypeScript narrowing) |
| `context/changes/ai-meal-generation/change.md`              | `status: plan_reviewed`, `plan_review_verdict: SOUND`                                                                      |
| Roadmap F-02                                                | `status: ready`, all prerequisites (F-01) marked done                                                                      |
