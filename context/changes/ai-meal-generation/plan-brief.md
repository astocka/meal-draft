# AI Meal Generation — Plan Brief

> Full plan: `context/changes/ai-meal-generation/plan.md`
> Research: `context/changes/ai-meal-generation/research.md`

## What & Why

F-02 implements the server-side generation path: a `POST /api/generate` endpoint that accepts a
user's pantry constraints and returns exactly one structured `MealRecipe`. This is the engine that
all generator UI slices (S-03, S-04) will call — it must exist before any interactive meal
generation is possible.

## Starting Point

The DB schema (F-01) delivered `pantry_products`, `generation_history`, and `favorite_meals` with
correct shapes, RLS, and a prune trigger. TypeScript domain types (`MealRecipe`, `MealType`,
`GenerationHistoryEntry`) are live in `src/types.ts`. No AI SDK is installed; no API key is wired.
The canonical API route pattern is established by `src/pages/api/pantry/index.ts`.

## Desired End State

Authenticated users can call `POST /api/generate` with a meal type and optional time preset and
receive a single `MealRecipe` whose every non-staple ingredient is sourced from their pantry. A
history row is persisted in `generation_history` on success. No-match scenarios return a structured
`{ recipe: null, reason: "no_match" }` without DB writes. The endpoint is verified on the workerd
runtime (not just Node.js dev server).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| LLM provider | OpenRouter + `openai/gpt-4.1-nano` | Aligns with `infrastructure.md`, cheapest provider with first-class `json_schema` enforcement and sub-200ms TTFT. | Research |
| SDK | Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider` | `generateObject` gives Zod-native schema binding and Response Healing; confirmed Cloudflare Workers compatible. | Research |
| Prompt strategy | PJ+ zero-shot | `json_schema` via API + schema in system prompt; zero-shot outperforms few-shot for well-typed JSON on GPT-4o-class models. | Research |
| Pantry validation | Soft — server-side staples allowlist | Universal basics (salt, oil, butter, etc.) should not require explicit pantry entries; all other ingredients are strictly validated. | Plan |
| Retry strategy | Retry-once on pantry violation | Catches stochastic sampling artifacts with one extra LLM call; explicit model `no_match` responses are not retried. | Plan |
| No-match history | No DB insert for semantic no-match | Null rows would displace successful recipes in the 20-row prune cap; `console.warn` is sufficient for MVP observability. | Research |
| Error history | Insert `recipe: null` on technical error | Provides a structured signal for provider instability without polluting the user-visible history list (S-06 queries `WHERE recipe IS NOT NULL`). | Research |
| Analytics | `console.warn` only (MVP) | Zero migration cost; Cloudflare Logpush can be wired later when data is actually needed for decisions. | Plan |
| Empty pantry | Short-circuit before LLM call | Zero token cost for an impossible request; logically correct. | Plan |
| Service split | `src/lib/generation.ts` + thin route | Matches existing `src/lib/` pattern; enables S-04 reuse without duplication; keeps route handler ≤30 lines. | Research |
| `exclude_names` | Accepted in request, passed as user message | S-04 ("Try another") reuse from day one; keeping it out of the system prompt preserves potential prompt caching. | Research |

## Scope

**In scope:**
- `pnpm add ai @openrouter/ai-sdk-provider`
- `OPENROUTER_API_KEY` in `astro.config.mjs` env schema and `.env.example`
- Three new types in `src/types.ts`: `GenerateRequest`, `GenerateResponse`, `GenerationResult`
- `src/lib/generation.ts` — service with `COOKING_STAPLES`, `buildSystemPrompt`, `generateMeal`
- `src/lib/generation-schema.ts` — Zod request validator
- `src/pages/api/generate.ts` — thin POST handler

**Out of scope:**
- UI changes (`MealGeneratorPlaceholder.astro` untouched — S-03)
- Streaming responses
- Analytics/log table for no-match events
- Cloudflare Workers AI binding
- Database migrations

## Architecture / Approach

```
POST /api/generate
     │
     ▼
src/pages/api/generate.ts   ← thin HTTP adapter (auth, parse, Zod, map result)
     │
     ▼
src/lib/generation.ts       ← orchestrator
  ├─ supabase: fetch pantry_products
  ├─ empty pantry? → no_match
  ├─ buildSystemPrompt (pantry + staples + constraints)
  ├─ generateObject (OpenRouter / GPT-4.1-nano, json_schema, Response Healing)
  ├─ no_match signal? → no_match (no retry)
  ├─ soft-pantry validation (pantryNames ∪ COOKING_STAPLES)
  ├─ validation fail? → retry once → no_match
  ├─ success → insert generation_history → { status: "ok" }
  └─ exception after retry → insert sentinel row → { status: "error" }
```

## Pre-flight: Context7 Doc Lookups

Before writing any code, run these MCP calls in Cursor to pull current docs for the two new packages (the AI SDK moves fast — stale training data is a real risk here):

| Step | Tool | Key params | Purpose |
|---|---|---|---|
| 1 | `resolve-library-id` | `libraryName: "Vercel AI SDK"`, `query: "Cloudflare Workers workerd compatibility"` | Get library ID, confirm workerd compat |
| 2 | `resolve-library-id` | `libraryName: "@openrouter/ai-sdk-provider"`, `query: "createOpenRouter initialization"` | Get library ID for provider |
| 3 | `query-docs` | `libraryId: <id from step 1>`, `query: "generateObject schema schemaName system prompt provider options"` | Exact `generateObject` call signature |
| 4 | `query-docs` | `libraryId: <id from step 2>`, `query: "createOpenRouter apiKey plugins response-healing require_parameters"` | Provider init + plugin syntax |

Steps 1–2 before Phase 1. Steps 3–4 before Phase 2.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Foundation | Packages, env secret, TS types | Build may fail if workerd-incompatible transitive dep is pulled in |
| 2. Generation service | Full orchestration in `src/lib/generation.ts` | Soft-pantry allowlist and system prompt must reference the same constant |
| 3. API route | Live `POST /api/generate` endpoint | workerd `global_fetch_strictly_public` — must verify via `build && preview`, not just `astro dev` |

**Prerequisites:** `OPENROUTER_API_KEY` must be obtained (OpenRouter account, free tier sufficient
for dev) and added to `.env` before Phase 2 manual testing. Phase 1 (type/env changes) can land
without the key.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- GPT-4.1-nano reliably honours the strict-pantry constraint at zero-shot. If validation failure
  rate exceeds ~2% in production, add a single compressed few-shot example to the system prompt.
- OpenRouter's Response Healing plugin handles the long tail of malformed JSON; if it proves
  unreliable for this model, fall back to manual `JSON.parse` with a try/catch after stripping
  markdown fences.
- The `COOKING_STAPLES` list is opinionated and minimal. Real-world testing may reveal additions
  (e.g., `garlic`, `onion`); the list is exported and easy to extend.

## Success Criteria (Summary)

- Authenticated `POST /api/generate` returns a valid `MealRecipe` where every non-staple
  ingredient is present in the user's `pantry_products` row.
- A matching `generation_history` row is visible in Supabase Studio after a successful call.
- The endpoint returns the same correct response when tested via `pnpm run build && pnpm run preview`
  (workerd runtime), not only under `pnpm run dev` (Node.js).
