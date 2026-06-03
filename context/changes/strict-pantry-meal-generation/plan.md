# Strict-Pantry Meal Generation (S-03) Implementation Plan

## Overview

Ship the north-star dashboard experience: logged-in user sets meal type and time budget, taps **Generuj**, and sees exactly one strict-pantry recipe or a clear Polish **no_match** info panel. F-02 (`POST /api/generate`) and S-02 (pantry shell) are done — this slice is **frontend-only**: wire parsing, `DashboardShell` with mobile tabs, `MealGenerator` island, `loadError` UX, and workerd verification.

## Current State Analysis

- `POST /api/generate` returns `200` success (`recipe` + `history_id`), `200` `no_match`, or error statuses (`401`, `400`, `429`, `500`, `503`) — see `src/pages/api/generate.ts`.
- Pantry is server-prefetched in `dashboard.astro`; `PantryWidget` has no `loadError` prop; prefetch failure only logs (TODO lines 19–22).
- Right column is `MealGeneratorPlaceholder.astro`; hidden on mobile (`hidden md:flex`). No `/api/generate` client in `src/`.
- `GenerateResponse` in `src/types.ts` models success only — no wire union for `no_match` or errors.
- shadcn: only `button.tsx` installed; `tabs` / `card` absent.
- Prerequisites F-01, F-02, S-02 are complete per roadmap.

### Key Discoveries

- `src/lib/generation.ts:116-124` — empty pantry → `no_match` before LLM; client empty-pantry guard avoids wasted calls.
- `src/components/pantry/PantryWidget.tsx:261-264` — English empty state; replace in S-03.
- `context/foundation/dashboard-layout.md:19-28` — mobile tabs required; desktop two-column unchanged.
- AGENTS.md — rate limit KV behaves on workerd, not `astro dev`; verify with `pnpm run build && pnpm run preview`.
- Pantry and generator share no React state today; empty-pantry disable needs `onItemsChange` or lifted count in `DashboardShell`.

## Desired End State

1. User on `/dashboard` (desktop) sees pantry left and live generator right; on mobile, tabs **Spiżarnia** | **Generator posiłków** switch full-height panels.
2. User selects meal type (Śniadanie / Obiad / Kolacja), time (**15 min** / **30 min** / **60 min** / **Dowolny czas**, default **Dowolny czas** → `null`), taps **Generuj**.
3. After 2–10s, user sees one recipe (name, prep time, ingredients, steps) or an info panel *Nie udało się stworzyć przepisu* with hints (hint 2 omitted when Dowolny czas selected).
4. Prefetch failure shows Polish load banner in both tabs; **Generuj** disabled.
5. Empty pantry (load OK) disables **Generuj** with a short hint; pantry column shows Polish empty copy.
6. `pnpm run lint` and `pnpm run build` pass; manual sign-off on workerd preview with `OPENROUTER_API_KEY`.

## What We're NOT Doing

- Try another / `exclude_names` UI (S-04).
- Favorites (S-05), history list UI (S-06).
- i18n layer — Polish strings inline only.
- Backend, migrations, or changes to `generateMeal` / strict-pantry validation.
- Distinguishing `no_match` sub-reasons (empty pantry vs model refusal) — single `reason: "no_match"`.
- Server re-validation of `prep_time_minutes` vs selected preset after LLM.
- Full pantry reskin — token pass focused on new S-03 surfaces.
- New automated test runner (no test suite in repo today).
- `history_id` in URL — React state only until history UI exists.

## Implementation Approach

Five phases in dependency order:

1. **Wire contract** — Zod response schemas + `parseGenerateResponse` so the UI can narrow types safely.
2. **Shell + design system** — shadcn installs, token nudge, `DashboardShell` with mobile tabs and desktop grid.
3. **Pantry UX** — `loadError`, Polish empty state, optional `onItemsChange` for live pantry count.
4. **Meal generator** — controls, API integration, result / no_match / error panels, remove placeholder.
5. **Verification** — lint, build, workerd preview manual checklist.

## Critical Implementation Details

**`no_match` is HTTP 200, not `!res.ok`:** Parse body after `res.ok`; branch on `recipe === null && reason === "no_match"` before treating as failure. Do not show destructive styling for `no_match`.

**Pantry count for disable:** `dashboard.astro` passes `initialItems.length` into shell; `PantryWidget` must notify shell when items change (add/delete) so mobile users who add their first ingredient can enable **Generuj** without refresh.

**Conditional hint 2:** Show *Wydłuż czas przygotowania* only when `maxPrepMinutes !== null` at time of the failed request (use state at submit, not stale UI).

---

## Phase 1: Generate API Wire Contract

### Overview

Add client-side response validation and parsing shared by `MealGenerator` and future S-04, without changing the server handler.

### Changes Required

#### 1. Response schemas

**File**: `src/lib/generation-schema.ts`

**Intent**: Co-locate request and response Zod schemas; export inferred types for the client.

**Contract**:
- Keep existing `generateRequestSchema`.
- Add schemas for: success body `{ recipe, history_id }`, no_match `{ recipe: null, reason: "no_match" }`, error body `{ error: string }` (and narrow `reason` literal where useful).
- Export types via `z.infer<typeof …>` (e.g. `GenerateSuccessBody`, `GenerateNoMatchBody`).

#### 2. Response parser

**File**: `src/lib/parse-generate-response.ts` (new)

**Intent**: Single entry point used by the generator after `res.json()` — mirror defensive style of `parsePantryItemResponse` in `PantryWidget.tsx`.

**Contract**:
- `parseGenerateResponse(body: unknown, status: number): { kind: 'success'; recipe: MealRecipe; history_id: string } | { kind: 'no_match' } | { kind: 'error'; code: 'unauthorized' | 'validation' | 'rate_limit' | 'generation_failed' | 'unavailable' | 'network' | 'unknown'; message: string }`
- Map `status === 429` and `error === 'rate_limit_exceeded'` to `rate_limit`.
- Map `status === 400` to `validation` with a **fixed Polish** user message — never pass through the API `error` string (Zod messages are English).
- Invalid JSON or schema mismatch → `unknown` / safe Polish fallback message constant (defined alongside parser or in a small `src/lib/generation-copy.ts`).

#### 3. Types alignment (optional thin re-export)

**File**: `src/types.ts`

**Intent**: Avoid duplicate manual interfaces; re-export inferred success type or deprecate narrow `GenerateResponse` in favor of schema exports if imports are cleaner.

**Contract**: Document that HTTP wire shapes live in `generation-schema.ts`; service-layer `GenerationResult` unchanged.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Parser unit-checked manually (or quick dev script): success JSON, no_match JSON, and `{ error: "rate_limit_exceeded" }` with status 429 all narrow correctly

**Implementation Note**: Pause for human confirmation after manual parser check before Phase 2.

---

## Phase 2: shadcn, Theme, and DashboardShell

### Overview

Install UI primitives, align tokens with cosmic/purple dashboard, and replace the raw two-column grid with a shell that implements mobile tabs.

### Changes Required

#### 1. shadcn components

**Files**: `src/components/ui/tabs.tsx`, `src/components/ui/card.tsx` (+ any toggle/group if used for presets)

**Intent**: Add primitives via CLI per AGENTS.md (`npx shadcn@latest add tabs card`).

**Contract**: new-york style; use `cn()` for `className` overrides; no manual Tailwind string concatenation.

#### 2. Theme tokens

**File**: `src/styles/global.css`

**Intent**: Nudge `--primary`, `--ring`, `--border`, `--card` toward purple/dark glass for shadcn surfaces used in S-03.

**Contract**: Scoped to variables; pantry-specific `border-white/10` patterns remain where tokens are insufficient.

#### 3. DashboardShell island

**File**: `src/components/dashboard/DashboardShell.tsx` (new)

**Intent**: Own mobile tab state; render pantry column + generator column; desktop uses `md:grid md:grid-cols-2` without tab bar.

**Contract**:
- Props: `initialItems: PantryProduct[]`, `loadError: boolean`.
- Mobile (`<md`): shadcn `Tabs` — *Spiżarnia* | *Generator posiłków*; one panel full height.
- Desktop: both panels visible; no tabs.
- Column headers in Polish (*Spiżarnia*, *Generator posiłków*).
- Track `pantryCount` state (initialized from `initialItems.length`); **do not import `MealGenerator` in Phase 2** — generator column shows empty shell chrome or minimal placeholder until Phase 4.

#### 4. Dashboard page wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Remove direct `PantryWidget` + hidden placeholder grid; mount `<DashboardShell client:load initialItems={…} loadError={!!error} />`.

**Contract**: Remove TODO at lines 19–22; keep prefetch query unchanged. Remove the standalone `<PantryWidget client:load … />` from `.astro` — `PantryWidget` is rendered only inside `DashboardShell` with **no** `client:*` directive on `.astro` (single hydrated island).

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Desktop: two columns visible; generator area empty or shows shell chrome (before Phase 4 content)
- Mobile: tab bar visible; switching tabs shows pantry vs generator panel full viewport
- No regression to sign-out topbar

**Implementation Note**: Pause for human mobile/desktop layout check before Phase 3.

---

## Phase 3: Pantry Polish and loadError

### Overview

Ship prefetch failure UX and Polish empty state; expose pantry count updates to the shell.

### Changes Required

#### 1. PantryWidget loadError and copy

**File**: `src/components/pantry/PantryWidget.tsx`

**Intent**: Show load banner; Polish empty message; notify parent on item count changes.

**Contract**:
- Props: `loadError?: boolean`, `onItemsChange?: (count: number) => void` — call after successful add/delete and on mount with current length.
- Load banner (info tone, `CircleAlert`): *Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później.*
- Empty: *Twoja spiżarnia jest pusta – dodaj swój pierwszy składnik*
- When `loadError`, de-emphasize add/list (per research sketch).

#### 2. Shell wiring

**File**: `src/components/dashboard/DashboardShell.tsx`

**Intent**: Pass `loadError` to `PantryWidget` only; wire `onItemsChange` → `setPantryCount`. (`MealGenerator` + `loadError` wiring deferred to Phase 4.)

**Contract**: `pantryCount` initialized from `initialItems.length`.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Simulate or force prefetch error → banner in pantry tab; generator tab shows same message in Phase 4
- Empty pantry shows Polish copy
- Add first item → `pantryCount` becomes 1 (verify in devtools or Phase 4 enablement)

**Implementation Note**: Pause before Phase 4.

---

## Phase 4: MealGenerator Island

### Overview

Replace placeholder with interactive generator: controls, API call, loading, success card, no_match info panel, error panel (429 distinct).

### Changes Required

#### 1. MealGenerator component

**File**: `src/components/meal/MealGenerator.tsx` (new)

**Intent**: Full S-03 UX in the right panel / generator tab.

**Contract**:
- Props: `loadError: boolean`, `pantryCount: number`.
- State: `mealType` default `'lunch'`, `maxPrepMinutes: null` on load, `status: 'idle' | 'loading' | 'success' | 'no_match' | 'error'`, `recipe`, `historyId`, `errorMessage`.
- Controls: meal type toggle/buttons; time presets 15 / 30 / 60 / Dowolny czas (mutually exclusive, default Dowolny czas selected visually).
- **Generuj**: `POST /api/generate` body `{ meal_type, max_prep_time_minutes, exclude_names: [] }`; disable when `loadError`, `pantryCount === 0`, or loading.
- Empty pantry hint when disabled (e.g. *Dodaj składniki w zakładce Spiżarnia*).
- Loading: `Loader2` + *Tworzę przepis…*; disable button (no optimistic recipe).
- Success: shadcn `Card` with name, prep time, ingredients list, steps.
- `no_match`: info panel — title *Nie udało się stworzyć przepisu*; *Co możesz zrobić?*; hints 1 & 3 always; hint 2 only if `maxPrepMinutes != null` at submit.
- Errors: inline panel — 429 → *Osiągnięto limit generowania. Spróbuj ponownie za godzinę.*; 400/validation → fixed Polish copy from parser (not API body); other failures → generic Polish server/network copy; 401 → session message or redirect expectation (user is on protected `/dashboard`).
- On success, store `history_id` in state (no UI).

#### 2. Shell integration

**File**: `src/components/dashboard/DashboardShell.tsx`

**Intent**: Mount `MealGenerator` in generator column/panel with `loadError` and `pantryCount`.

#### 3. Remove placeholder

**Files**: `src/components/meal/MealGeneratorPlaceholder.astro` — delete or stop importing; `dashboard.astro` no longer references it.

### Polish copy reference (v1)

| Key | Text |
|-----|------|
| generate | Generuj |
| loading | Tworzę przepis… |
| meal breakfast | Śniadanie |
| meal lunch | Obiad |
| meal dinner | Kolacja |
| time any | Dowolny czas |
| tab pantry | Spiżarnia |
| tab generator | Generator posiłków |
| load error | Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później. |
| no match title | Nie udało się stworzyć przepisu |
| hints heading | Co możesz zrobić? |
| hint add | Dodaj więcej składników |
| hint time | Wydłuż czas przygotowania |
| hint meal type | Zmień typ posiłku |
| rate limit | Osiągnięto limit generowania. Spróbuj ponownie za godzinę. |
| validation | Nieprawidłowe dane żądania. Spróbuj ponownie. |

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- With pantry items + `OPENROUTER_API_KEY` in `.dev.vars`: **Generuj** returns a recipe card
- `no_match`: info panel (not red error); hint 2 hidden when Dowolny czas
- Empty pantry: button disabled + hint
- `loadError`: banner in generator + disabled button
- 429: distinct inline message (may require repeated calls or KV config)
- Mobile: generate from Generator tab after adding items on Pantry tab without refresh

**Implementation Note**: Pause for north-star manual sign-off before Phase 5.

---

## Phase 5: workerd Verification and Docs Sync

### Overview

Confirm runtime behavior on Cloudflare workerd and update change tracking.

### Changes Required

#### 1. Runtime verification

**Intent**: Run production-like preview per AGENTS.md.

**Contract**: `pnpm run build && pnpm run preview` (or `preview:wrangler`); exercise generate flow; confirm rate limit path if feasible.

#### 2. change.md status

**File**: `context/changes/strict-pantry-meal-generation/change.md`

**Intent**: Document status transitions for the change folder (not part of runtime code).

**Contract**: On `/10x-implement` start, set `change.md` `status: in_progress`; when the slice ships, set `status: implemented` (or project convention). Update `updated` date accordingly. Do not revert to `planned` — current state is `plan_reviewed` until implement starts.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- workerd preview: successful generation and `no_match` both behave
- No console errors on tab switch / generate
- Desktop and mobile layouts match `dashboard-layout.md`

---

## Testing Strategy

### Unit Tests

- None in S-03 (repo has no test runner). Parser correctness verified manually in Phase 1.

### Integration Tests

- Deferred to post-MVP E2E.

### Manual Testing Steps

1. Sign in → `/dashboard` — desktop two columns, mobile tabs.
2. Add 2–3 pantry items → **Generuj** with each meal type and time preset.
3. Dowolny czas + sparse pantry → `no_match` without hint 2.
4. 15 min preset + `no_match` → hint 2 visible.
5. Empty pantry → disabled **Generuj**.
6. Break prefetch (e.g. invalid env) → load banners, disabled generate.
7. Hit rate limit (if possible) → 429 copy.
8. `build && preview` on workerd.

## Performance Considerations

- LLM calls take 2–10s — full-request loading state required (NFR >1s feedback).
- No optimistic recipe rendering.
- Each generate re-reads pantry server-side — no client stale-body risk.

## Migration Notes

- None (no schema changes).
- Existing users with empty pantry see new Polish copy only.

## References

- Research: `context/changes/strict-pantry-meal-generation/research.md`
- Layout: `context/foundation/dashboard-layout.md`
- API: `src/pages/api/generate.ts`, `src/lib/generation-schema.ts`, `src/lib/generation.ts`
- Patterns: `src/components/pantry/PantryWidget.tsx`
- F-02 plan: `context/changes/ai-meal-generation/plan.md`
- Roadmap S-03: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Generate API Wire Contract

#### Automated

- [x] 1.1 Linting passes: `pnpm run lint`
- [x] 1.2 Production build passes: `pnpm run build`

#### Manual

- [x] 1.3 Parser manual check: success, no_match, and 429 bodies narrow correctly

### Phase 2: shadcn, Theme, and DashboardShell

#### Automated

- [x] 2.1 Linting passes: `pnpm run lint`
- [x] 2.2 Production build passes: `pnpm run build`

#### Manual

- [x] 2.3 Desktop two-column layout intact with shell mounted
- [x] 2.4 Mobile tabs switch Spiżarnia / Generator full-height panels
- [x] 2.5 No regression to sign-out topbar

### Phase 3: Pantry Polish and loadError

#### Automated

- [x] 3.1 Linting passes: `pnpm run lint`
- [x] 3.2 Production build passes: `pnpm run build`

#### Manual

- [x] 3.3 loadError shows Polish banner in pantry panel
- [x] 3.4 Empty pantry shows Polish empty copy
- [x] 3.5 onItemsChange updates pantry count when items added/removed

### Phase 4: MealGenerator Island

#### Automated

- [ ] 4.1 Linting passes: `pnpm run lint`
- [ ] 4.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 4.3 Successful generate shows recipe card; history_id stored in state
- [ ] 4.4 no_match info panel with conditional hint 2
- [ ] 4.5 Empty pantry and loadError disable Generuj with appropriate messaging
- [ ] 4.6 Rate limit 429 shows dedicated Polish inline error
- [ ] 4.7 Mobile: add pantry item then generate without page refresh

### Phase 5: workerd Verification and Docs Sync

#### Automated

- [ ] 5.1 Linting passes: `pnpm run lint`
- [ ] 5.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 5.3 workerd preview: generate and no_match flows verified
- [ ] 5.4 Desktop and mobile match dashboard-layout.md
