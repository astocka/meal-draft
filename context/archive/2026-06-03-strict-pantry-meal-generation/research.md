---
date: 2026-06-03
researcher: AI agent
git_commit: 8f60997904557d816dd98eed378610871ffad810
branch: main
repository: meal-draft
topic: "S-03 strict-pantry meal generation — codebase readiness and UI integration surface"
tags:
  [
    research,
    codebase,
    strict-pantry-meal-generation,
    dashboard,
    meal-generator,
    api-generate,
    mobile-tabs,
    pantry-widget,
  ]
status: complete
last_updated: 2026-06-03
last_updated_by: AI agent
last_updated_note: "S-03 implemented — MealGenerator, DashboardShell, roadmap done"
---

# Research: S-03 Strict-Pantry Meal Generation — Codebase Readiness

**Date**: 2026-06-03
**Researcher**: AI agent
**Git Commit**: `8f60997904557d816dd98eed378610871ffad810`
**Branch**: main
**Repository**: meal-draft

## Research Question

What does the codebase provide today for S-03 (`strict-pantry-meal-generation`), what must be built in the UI, and how should the frontend integrate with the existing F-02 generation API?

## Summary

**S-03 shipped (2026-06-03).** F-02 provides `POST /api/generate`; S-02 provides pantry CRUD; S-03 adds `MealGenerator`, `DashboardShell` (mobile tabs), wire parsing, and Polish UX on `/dashboard`.

The implementation path is straightforward: replace the placeholder with a React island (`client:load`), map constraint controls to `GenerateRequest`, call `POST /api/generate` using the same fetch patterns as `PantryWidget`, render `MealRecipe` or friendly `no_match` copy, and add mobile-only `Pantry | Meal Generator` tabs. No migrations or backend changes are required.

**Time budget (resolved):** Preset buttons **15 / 30 / 60** min + **Any time**; default **Any time** (`null` on load).

**UI stack (resolved):** **shadcn + Tailwind** for S-03; light theme customization. **All user-facing UI copy in Polish for v1 (MVP).**

---

## Detailed Findings

### 1. Dashboard shell (S-02) — ready, generator column is placeholder

`src/pages/dashboard.astro` server-prefetches pantry for `PantryWidget` and renders a two-column grid on desktop:

```31:42:src/pages/dashboard.astro
    <main class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <div class="flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
        ...
          <PantryWidget client:load initialItems={initialItems} />
        ...
      </div>
      <div class="hidden min-h-0 flex-col md:flex">
        <MealGeneratorPlaceholder />
      </div>
    </main>
```

| Aspect                    | Status                                   |
| ------------------------- | ---------------------------------------- |
| Two-column desktop layout | Done (`md:grid-cols-2`)                  |
| Pantry SSR prefetch       | Done (lines 13–24)                       |
| Generator on mobile       | **Hidden** (`hidden md:flex` on line 40) |
| Mobile tabs               | **Not implemented**                      |
| Pantry prefetch error UI  | Deferred (TODO lines 19–22)              |

`MealGeneratorPlaceholder.astro` is static copy only — no controls, no `client:*` directive.

**S-03 must:** swap placeholder for interactive generator; implement mobile tabs per `context/foundation/dashboard-layout.md` (lines 19–28).

---

### 2. F-02 generation API — complete contract for UI

**Handler:** `src/pages/api/generate.ts`

| HTTP    | Body                                         | When                                                              |
| ------- | -------------------------------------------- | ----------------------------------------------------------------- |
| **200** | `{ recipe: MealRecipe, history_id: string }` | Success                                                           |
| **200** | `{ recipe: null, reason: "no_match" }`       | Empty pantry, model refusal, or strict-pantry failure after retry |
| **401** | `{ error: "Unauthorized" }`                  | No session                                                        |
| **400** | `{ error: string }`                          | Invalid JSON / Zod (first issue message only)                     |
| **429** | `{ error: "rate_limit_exceeded" }`           | 10 requests / user / hour (KV)                                    |
| **500** | `{ error: "generation_failed" }`             | Service error                                                     |
| **503** | `{ error: "Service unavailable" }`           | Missing Supabase env                                              |

**Request schema** (`src/lib/generation-schema.ts`):

```3:7:src/lib/generation-schema.ts
export const generateRequestSchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner"]),
  max_prep_time_minutes: z.number().int().min(1).max(480).nullable(),
  exclude_names: z.array(z.string().max(80)).max(20).optional().default([]),
});
```

**Pantry source:** server reads `pantry_products` for the authenticated user inside `generateMeal` — **not** from the request body. Dashboard prefetch is for UI only; each Generate re-queries DB (no stale-body risk).

**Auth:** `/api/generate` is not in `PROTECTED_ROUTES`; the route returns 401 without `context.locals.user`. Same-origin `fetch` with session cookies (default) is sufficient.

**S-04 forward-compat:** pass `exclude_names: []` in S-03; API already accepts it.

**Client gaps:**

- No typed wire union for `no_match` / errors in `src/types.ts` (only `GenerateResponse` for success).
- All `no_match` causes share one `reason` — UI cannot distinguish empty pantry vs model refusal.
- `prep_time_minutes` is prompt-enforced only; server does not re-check against `max_prep_time_minutes` after LLM response.
- Rate limit fails open when KV unavailable (`astro dev` on Node); verify on workerd via `pnpm run build && pnpm run preview`.

---

### 3. Types and service behavior

`src/types.ts` defines `MealType`, `MealRecipe`, `GenerateRequest`, `GenerateResponse`, `GenerationResult`.

Strict-pantry validation in `src/lib/generation.ts`:

- Loads pantry names from DB; empty → `no_match` before LLM.
- OpenRouter `gpt-4.1-nano` with structured output; up to 2 attempts on pantry violation.
- Staples allowlist (`COOKING_STAPLES`) permits oil, salt, etc. not in pantry.
- Success inserts `generation_history` and returns `history_id`.
- Semantic `no_match` does **not** write history (per F-02 plan).
- Failed LLM may insert sentinel `[generation failed]` row without returning `history_id` to client.

---

### 4. Frontend patterns to reuse (PantryWidget)

`src/components/pantry/PantryWidget.tsx`:

- Relative URLs: `fetch("/api/pantry", ...)`
- `Content-Type: application/json`
- Status-specific handling (`409`, `!res.ok`, `try/catch`)
- Defensive JSON parsing (`parsePantryItemResponse`) — mirror for generate responses
- Optimistic updates for fast CRUD — **do not** optimistically show recipes (multi-second LLM)
- `Loader2` spinner for slow ops (rename path) — use same pattern for Generate

**No `src/components/hooks/` yet** — generator state can live in a new `MealGenerator.tsx` island.

**shadcn Tabs:** not installed (`src/components/ui/tabs*` absent). Options for mobile tabs: add via `npx shadcn@latest add tabs`, or lightweight custom tab bar in Astro/React per `dashboard-layout.md`.

---

### 5. PRD and roadmap scope

**US-01** (`context/foundation/prd.md` lines 47–62): logged-in user with pantry → set time + meal type → Generate → one suggestion (name, time, ingredients, steps) or clear no-match message. “Try another” is US-06 / **S-04**, not S-03.

| Ref    | Requirement                           | S-03 UI                                             |
| ------ | ------------------------------------- | --------------------------------------------------- |
| FR-007 | Presets + “Any time”; no custom text  | Preset buttons → `max_prep_time_minutes`            |
| FR-008 | breakfast / lunch / dinner            | Meal type control                                   |
| FR-009 | Exactly one suggestion; strict pantry | Render single `MealRecipe`; trust server validation |

**Roadmap S-03** (`context/foundation/roadmap.md` lines 120–132): north star; prerequisites F-01, F-02, S-02 all **done**; mobile tabs explicit.

**Out of scope for S-03:** Try another (S-04), favorites (S-05), history list (S-06). Stash `history_id` on success for future S-06 if useful.

---

### 6. Time budget constraints (Q1 resolved)

| Control               | S-03 value                                   |
| --------------------- | -------------------------------------------- |
| Preset buttons        | **15**, **30**, **60** minutes               |
| No-restriction option | **Any time** → `max_prep_time_minutes: null` |
| Default on load       | **Any time** (`null`)                        |

PRD FR-007 lists example presets including 45 min; product chose **15/30/60** (aligned with F-02 `research.md`). API accepts any integer 1–480 or `null` — no backend change.

---

## Code References

- `src/pages/dashboard.astro:31-42` — layout; generator hidden on mobile
- `src/components/meal/MealGeneratorPlaceholder.astro` — placeholder to replace
- `src/components/pantry/PantryWidget.tsx` — fetch/error/spinner patterns
- `src/pages/api/generate.ts:27-65` — HTTP mapping
- `src/lib/generation-schema.ts:3-7` — request validation
- `src/lib/generation.ts` — pantry load, LLM, strict-pantry gate, history insert
- `src/types.ts:1-49` — DTOs
- `src/middleware.ts` — `/dashboard` protected; APIs use per-route 401
- `context/foundation/dashboard-layout.md:19-28` — mobile tab spec
- `context/foundation/prd.md:47-62,148-153` — US-01, FR-007–009

---

## Architecture Insights

1. **Vertical slice split:** F-02 = server generation; S-03 = dashboard UX only. Keeps plan small and testable.
2. **Decoupled panels:** Pantry and generator share no React state; empty-pantry guard is optional UX (server is authoritative).
3. **200 vs error for no_match:** Treat `recipe: null` as a product state, not `!res.ok` — distinct from 500/429.
4. **Mobile-first navigation:** Tabs avoid stacking full pantry above generator (`dashboard-layout.md`).
5. **workerd verification:** AGENTS.md — run `build && preview` before deploy; KV rate limit and fetch behave differently than `astro dev`.

---

## Historical Context (from prior changes)

| Artifact                                                 | Relevance                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `context/changes/ai-meal-generation/plan.md`             | API contract, explicit deferral of UI/spinner to S-03                                    |
| `context/changes/ai-meal-generation/research.md`         | Preset resolution (15/30/60), provider choice, no history on semantic no_match           |
| `context/changes/pantry-crud/plan.md`                    | Dashboard as app home; optimistic pantry; placeholder until S-03                         |
| `context/changes/pantry-crud/follow-ups/review-fixes.md` | `loadError` — **in scope for S-03** (see decision below)                                 |
| `context/foundation/roadmap.md`                          | S-03 ready; F-02 done 2026-06-02; baseline section partially stale (“no generation API”) |

---

## Related Research

- `context/changes/ai-meal-generation/research.md` — F-02 backend readiness (prerequisite)
- `context/changes/domain-data-schema/research.md` — schema/RLS (F-01)

---

## S-03 Implementation Checklist (for `/10x-plan`)

1. **`MealGenerator.tsx`** — `client:load`; state: `mealType`, `maxPrepMinutes`, `status`, `recipe`, `errorMessage`.
2. **shadcn** — add `tabs` (mobile Pantry | Generator), `card` (result), toggle group or styled buttons for presets/meal type; install via `npx shadcn@latest add …`.
3. **Theme pass (S-03)** — tune `--primary`, `--ring`, `--border`, etc. in `global.css` toward purple/cosmic; align new components with pantry (`border-white/10`, `bg-white/5`) where tokens aren’t enough.
4. **Controls** — meal type (3 options); time presets **15 | 30 | 60 | Any time** (default **Any time** → `null`); Generate button (disabled when loading / optional empty pantry).
5. **`POST /api/generate`** — body `{ meal_type, max_prep_time_minutes, exclude_names: [] }`; parse success vs `no_match` vs errors.
6. **Result UI** — render `name`, `prep_time_minutes`, `ingredients`, `steps`; on `no_match`, show title + hints block (see decision — not error-toast styling).
7. **Loading** — full-request spinner (2–10s); disable Generate (NFR >1s feedback).
8. **Mobile tabs** — shadcn `Tabs`: `Pantry | Meal Generator` below topbar, `< md` only; desktop two-column grid unchanged.
9. **Replace** `MealGeneratorPlaceholder` in `dashboard.astro`; unhide generator on mobile via tab panel, not `md:flex` alone.
10. **`loadError` (pantry prefetch)** — `dashboard.astro` passes `loadError={!!error}` to `PantryWidget`; show Polish banner (see decision); disable or warn on Generate when pantry did not load.
11. **Empty pantry** — replace English empty state in `PantryWidget.tsx` (line 263) with Polish copy (see decision).
12. **`no_match` hints** — hide “Wydłuż czas przygotowania” when **Any time** is selected (`max_prep_time_minutes === null`).
13. **Verify** on workerd preview with `OPENROUTER_API_KEY` in `.dev.vars`.

---

## Follow-up Research 2026-06-03

### Decision: time budget default

**Owner:** user  
**Decision:** Default selection is **Any time** (`max_prep_time_minutes: null`), matching PRD FR-007. Generator UI loads with no time cap selected; user may pick a preset before Generate.

**Implications for `/10x-plan`:**

- Initial state: `maxPrepMinutes = null` (not 30).
- "Any time" preset button should appear selected on first render.
- API first call without user interaction sends `{ ..., max_prep_time_minutes: null }`.

### Decision: preset minute buttons

**Owner:** user  
**Decision:** Preset buttons **15 / 30 / 60** minutes (plus **Any time**). Maps to `max_prep_time_minutes: 15 | 30 | 60 | null`.

**Implications for `/10x-plan`:**

- Four mutually exclusive time controls: `15 min`, `30 min`, `60 min`, `Any time`.
- UI labels can show minutes; API sends integers or `null`.
- PRD example of 45 min is not used in v1.

### Decision: UI stack (shadcn + Tailwind, themed in S-03)

**Owner:** user  
**Decision:** Stay with **shadcn** components and **Tailwind** for styling. **Customize colors and feel during S-03** so the generator (and mobile tabs) match the cosmic dashboard — not generic shadcn defaults.

**How customization works (no extra CSS framework):**

| Layer                 | Where                                                     | What S-03 does                                                                                                                                                  |
| --------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global tokens**     | `src/styles/global.css` (`:root` / `.dark` CSS variables) | Nudge `--primary`, `--ring`, `--border`, `--card`, etc. toward purple + dark glass (dashboard already uses `bg-cosmic` and manual `white/10` borders on pantry) |
| **shadcn components** | `src/components/ui/*`                                     | Add `tabs`, `card`, toggles as needed; use variants + `className` via `cn()`                                                                                    |
| **Screen-specific**   | `MealGenerator.tsx`, `dashboard.astro`                    | Same patterns as `PantryWidget` (e.g. `bg-purple-600`, `border-white/10`) where tokens alone aren’t enough                                                      |

**Scope:** Theme pass focused on **new S-03 surfaces** (generator panel, mobile tabs, result card). Full pantry reskin is optional follow-up, not required for north star.

**Implications for `/10x-plan`:**

- Install shadcn pieces via `npx shadcn@latest add tabs card` (and toggle group if used for presets).
- Include a small **design/token task** in the plan before or alongside UI build.
- Do **not** add Bootstrap, DaisyUI, or a second styling system.

### Decision: pantry prefetch `loadError` (ship in S-03)

**Owner:** user  
**Decision:** **Ship in S-03.** When SSR pantry prefetch fails (`dashboard.astro` Supabase query returns `error`), show a **user-visible warning** instead of only `console.error`.

**Rationale:** Without this, a DB/network failure looks like an **empty pantry** — the user may tap Generate and get `no_match` or confusing behavior. A clear warning sets expectations and avoids blaming the product for missing data.

**Canonical copy (Polish):**

> Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później.

**Implementation sketch** (from `pantry-crud/follow-ups/review-fixes.md`):

- `dashboard.astro` — `loadError={!!error}` on `PantryWidget` (remove TODO at lines 19–22).
- `PantryWidget.tsx` — optional `loadError?: boolean`; when true, show banner with `CircleAlert` (match existing inline error pattern); hide or de-emphasize add/list until resolved.
- **Meal generator:** if `loadError`, do not treat as empty pantry — show same message or disable Generate (generation API would also fail or return misleading `no_match`).

### Decision: `no_match` copy (hints, info panel)

**Owner:** user  
**Decision:** When API returns `200` with `{ recipe: null, reason: "no_match" }`, show an **info panel** (muted/informational styling — **not** error-toast or destructive colors). Title + actionable hints. Distinct from `loadError` and from 500/network errors.

**Canonical copy (Polish):**

| Element           | Text                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Title**         | Nie udało się stworzyć przepisu                                                                                                         |
| **Hints heading** | Co możesz zrobić?                                                                                                                       |
| **Hint 1**        | Dodaj więcej składników                                                                                                                 |
| **Hint 2**        | Wydłuż czas przygotowania — **show only when a time preset is selected** (15 / 30 / 60), **not** when **Any time** (`null`) is selected |
| **Hint 3**        | Zmień typ posiłku                                                                                                                       |

**UX rules for `/10x-plan`:**

- Info panel: calm card / info-tone icon (e.g. `CircleAlert` with muted colors), same family as other inline notices — not red “error” styling.
- **Conditional hint 2:** `maxPrepMinutes != null` → show “Wydłuż czas przygotowania”; `maxPrepMinutes === null` (Any time default or user choice) → omit hint 2 entirely.
- Empty pantry has its **own** empty-state message in the pantry column (see below) — do not duplicate in the no_match panel unless both can appear in different contexts.

### Decision: empty pantry copy (Polish)

**Owner:** user  
**Decision:** Replace current English empty state in `PantryWidget.tsx` (`Your pantry is empty — add your first ingredient above`) with:

> Twoja spiżarnia jest pusta – dodaj swój pierwszy składnik

Ship in S-03 as part of Polish UI pass (pantry strings in scope even though pantry shipped in S-02).

### Decision: UI language (v1 MVP)

**Owner:** user  
**Decision:** **Polish only** for all user-facing UI strings in S-03 scope: generator, mobile tabs, presets, loading, errors, pantry empty/load messages, no_match panel. No i18n layer for v1; English dev-only (logs, code comments) unchanged.

**Examples to translate in plan:** Generate → _Generuj_; tabs _Spiżarnia_ | _Generator posiłków_; meal types _Śniadanie_ / _Obiad_ / _Kolacja_; time presets _15 min_ / _30 min_ / _60 min_ / _Dowolny czas_; loading _Tworzę przepis…_ (exact strings in plan).

---

## Open Questions

_None — research decisions complete for S-03 planning._
