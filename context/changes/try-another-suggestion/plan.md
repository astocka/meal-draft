# Try Another Suggestion (S-04) Implementation Plan

## Overview

Ship session-scoped **Spróbuj inny** on the dashboard generator: user rejects a shown recipe, taps Try another, and receives a different suggestion that excludes all previously shown meal names in the current session. When the LLM returns `no_match` after exclusions, show a distinct exhaustion panel (not the first-time failure copy). F-02 already accepts `exclude_names`; S-03 always sends `[]` — this slice is **frontend-only**.

## Current State Analysis

- `POST /api/generate` accepts `exclude_names` (max 20 × 80 chars) and injects them into the LLM user turn — `src/lib/generation.ts:134-138`.
- `MealGenerator.tsx` hardcodes `exclude_names: []` on every **Generuj** call and has no session accumulator or Try another button.
- `parseGenerateResponse` and `generation-copy.ts` handle success / `no_match` / errors but have no exhaustion-specific or Try another copy.
- `no_match` is HTTP 200 with `{ recipe: null, reason: "no_match" }` for all semantic failures — exhaustion must be inferred client-side from request-scoped `hadExclusions` (captured at fetch start when `exclude_names.length > 0`), not from `shownNames` at response time.
- S-03 stashes `historyId` in React state (sr-only); each successful generation still inserts into `generation_history` — Try another successes behave the same.
- Prerequisites S-03 shipped 2026-06-03 per roadmap.

### Key Discoveries

- `src/lib/generation-schema.ts:6` — Zod cap `exclude_names.max(20)` is the hard session ceiling; client must disable Try another at 20 exclusions to avoid 400 validation errors.
- `context/changes/ai-meal-generation/plan.md` — `exclude_names` intentionally lives in the user turn, not the system prompt; no backend change needed.
- `context/foundation/dashboard-layout.md:40` — Try another lives in the generator column beside existing controls; mobile tabs unchanged.
- Exclusion is prompt-only — LLM may rarely repeat a name; v1 accepts and shows it (no auto-retry).
- Rate limit (10 req/user/hour) applies to Try another the same as Generuj.

## Desired End State

1. User generates a recipe via **Generuj** → recipe card appears; session exclusion list is empty.
2. User taps **Spróbuj inny** → loading on that button only; current card stays visible until replaced.
3. Each Try another returns a different recipe (best-effort via `exclude_names`) or shows the exhaustion panel when `no_match` arrives with exclusions in flight.
4. User sees **Odrzucono: N** (rejected count) while a recipe is on screen or after rejections in the session.
5. At 20 exclusions, Try another is disabled with copy pointing user to **Generuj** for a fresh session.
6. **Generuj** clears the exclusion list and starts a new session; changing meal type or time alone does not reset exclusions.
7. `pnpm run lint` and `pnpm run build` pass; manual workerd preview signed off.

## What We're NOT Doing

- Backend, migration, or `generation.ts` changes.
- New API `reason: "exhausted"` field or server-side name dedup / auto-retry.
- True "remaining options" count (pool size is unknown to the LLM).
- Favorites (S-05), history list UI (S-06).
- i18n layer — Polish strings in `generation-copy.ts` or component constants.
- Extracted React hooks (S-03 kept logic inline in `MealGenerator`).
- Automated test suite (not configured in repo).
- Distinguishing empty-pantry `no_match` from model-refusal `no_match` on first Generuj (unchanged from S-03).

## Implementation Approach

Three phases in dependency order:

1. **Session state & shared fetch** — Accumulate `shownNames`, refactor fetch into a shared handler, wire `exclude_names`, split Generuj (reset session) vs Try another (append current name).
2. **Try another UI** — Secondary button beside Generuj, success-only visibility, keep-card loading, 20-cap disable with recovery copy.
3. **Exhaustion & pool indicator** — Distinct exhaustion panel, rejected-count display, Polish strings centralized.

## Critical Implementation Details

**Append timing (append-before-fetch, canonical):** On Try another click, append `lastRecipe.name` to `shownNames` before fetch, then send `shownNames` as `exclude_names`. On success, do **not** append the new recipe name — it is shown, not yet rejected. On Generuj, reset `shownNames` to `[]` at submit time.

**Exhaustion detection:** Capture `hadExclusions = excludeNames.length > 0` at request start (before `await`). When `parseGenerateResponse` returns `kind: "no_match"` and `hadExclusions` is true, render the exhaustion panel — not the S-03 first-time `NO_MATCH_TITLE` panel. Do not branch on `shownNames.length` at response time (stale-response safe). First Generuj with empty exclusions keeps existing S-03 no_match UX.

**Cap guard:** When `shownNames.length >= 20`, disable Try another before fetch; show inline copy (not an API error). User recovers via **Generuj**.

**Loading source:** Add `loadingSource: 'generate' | 'try_another' | null`. **Generuj** sets `loadingSource: 'generate'` and `status: 'loading'` (clears card per `resetRecipeOnLoad`). **Try another** sets `loadingSource: 'try_another'` but keeps `status: 'success'` so the button stays mounted and can show *Szukam innego…*; disable both buttons while `loadingSource !== null`.

---

## Phase 1: Session State & Shared Fetch

### Overview

Introduce session-scoped exclusion state and a single fetch path used by both Generuj and Try another, without changing the API contract.

### Changes Required

#### 1. Session exclusion state

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Track meal names shown in the current session so Try another can pass them as `exclude_names`.

**Contract**:
- Add `shownNames: string[]` state (starts `[]`).
- On **Generuj** submit: set `shownNames` to `[]` before fetch (fresh session).
- On **Try another** submit (append-before-fetch): `setShownNames(prev => [...prev, lastRecipe.name])`, then send `shownNames` as `exclude_names` (guard: only when `lastRecipe` non-null and `status === "success"`).
- On success: do not append the returned recipe name to `shownNames` — it becomes the current card, excluded only on the next Try another click.
- Rejected count (`Odrzucono: N`) equals `shownNames.length`.

#### 2. Shared fetch handler

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Deduplicate fetch/parse/state-transition logic between Generuj and Try another; differ only in exclusion list and pre-fetch UI reset behavior.

**Contract**:
- Extract something like `requestGeneration({ excludeNames, resetRecipeOnLoad: boolean, loadingSource: 'generate' | 'try_another' })`.
- Request body: `{ meal_type, max_prep_time_minutes, exclude_names: excludeNames }`.
- **Generuj**: `resetRecipeOnLoad: true`, `loadingSource: 'generate'` — set `status: 'loading'`, clear `lastRecipe`, `historyId` at start (current behavior).
- **Try another**: `resetRecipeOnLoad: false`, `loadingSource: 'try_another'` — keep `status: 'success'` and `lastRecipe` visible during loading; replace on success; on exhaustion `no_match` clear `lastRecipe` / card but **preserve** `shownNames` (rejected count and exhaustion panel remain accurate).
- Clear `loadingSource` to `null` when the request completes (success, `no_match`, or error).
- Reuse `parseGenerateResponse`; map `success` / `no_match` / `error` to existing status + feedback state.
- Capture `hadExclusions = excludeNames.length > 0` at request start for exhaustion vs first-time `no_match` branching in Phase 3.

#### 3. Polish copy constants (stub)

**File**: `src/lib/generation-copy.ts`

**Intent**: Centralize new user-facing strings alongside existing generation messages.

**Contract**: Export constants for: Try another button label, rejected-count label pattern, exhaustion title/body/hints, and 20-cap recovery message. Polish only.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- **Generuj** still sends `exclude_names: []` (verify in DevTools network tab).
- After one success, a Try another request includes the previous recipe `name` in `exclude_names`.
- **Generuj** after Try another clears `exclude_names` back to `[]`.
- Changing meal type or time without Generuj does not clear `shownNames`.

**Implementation Note**: Pause for human confirmation after manual network inspection before Phase 2.

---

## Phase 2: Try Another UI

### Overview

Add the Try another button with correct visibility, loading, and cap-disable behavior beside **Generuj**.

### Changes Required

#### 1. Try another button

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Expose the secondary action when a recipe is on screen.

**Contract**:
- Label: **Spróbuj inny** (or copy constant from `generation-copy.ts`).
- Render in the control bar beside **Generuj** (`flex` row, `justify-end`, gap).
- Visible when `lastRecipe !== null` and (`status === "success"` or `loadingSource === "try_another"`); enabled when `status === "success"`, `loadingSource === null`, plus existing guards (`!loadError`, `pantryCount > 0`, cap not reached).
- Use `Button` with `variant="outline"` (or secondary) to visually defer to **Generuj**.
- `onClick` → shared fetch with current session exclusions; do not reset recipe card on load.

#### 2. Loading UX

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Differentiate loading feedback between Generuj and Try another per plan decision.

**Contract**:
- **Generuj** loading: `loadingSource === 'generate'` — spinner + *Tworzę przepis…* on primary button; `status === 'loading'`.
- **Try another** loading: `loadingSource === 'try_another'` — spinner + *Szukam innego…* on Try another button only; `status` stays `'success'`; **Generuj** disabled while `loadingSource !== null`.
- Recipe card remains rendered during Try another loading.

#### 3. Twenty-exclusion cap guard

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Prevent Zod 400 when session exclusions hit the API max.

**Contract**:
- When `shownNames.length >= 20` (or equivalent pre-fetch count), disable Try another.
- Show short inline copy near buttons: user must tap **Generuj** to start a new session.
- Do not call the API when disabled.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Try another appears only after a successful generation; hidden in idle / no_match / error states.
- Card stays visible while Try another loads; updates in place on success.
- At 20 exclusions, Try another is disabled and cap message visible; no 400 from API.
- Both buttons disabled during loading; no double-submit.

**Implementation Note**: Pause for human Try another flow sign-off before Phase 3.

---

## Phase 3: Exhaustion Panel & Pool Indicator

### Overview

Meet PRD US-06 acceptance criteria for shrinking-pool indication and distinct exhaustion messaging.

### Changes Required

#### 1. Exhaustion panel

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: When Try another exhausts options, show actionable copy distinct from first-time no_match.

**Contract**:
- Condition: `feedback === "exhausted"` (set when `kind === "no_match"` and request-scoped `hadExclusions` was true) — distinct from first-time `feedback === "no_match"`.
- Distinct title, e.g. *Wykorzystano propozycje w tej sesji* (final copy in `generation-copy.ts`).
- Body + hints: suggest relaxing meal type and/or time budget (always show meal-type hint; show time hint when `maxPrepMinutes !== null` at submit — mirror S-03 `showTimeHintOnNoMatch` pattern).
- Info panel styling (purple border/bg) — same as S-03 no_match, not error styling.
- First-time Generuj `no_match` (empty `exclude_names`) keeps existing `NO_MATCH_TITLE` + hints unchanged.

#### 2. Rejected-count indicator

**File**: `src/components/meal/MealGenerator.tsx`

**Intent**: Show honest pool-shrinking signal per PRD — count of rejected meals, not fake remaining count.

**Contract**:
- Display when `shownNames.length > 0` (includes post-exhaustion state where card is cleared but rejections remain).
- Format: **Odrzucono: N** near recipe card or control bar (subtle `text-white/50` / `text-xs`).
- Increment N as user rejects meals (length of `shownNames` or equivalent).
- Hide or show `0` when session is fresh after Generuj.

#### 3. Copy module completion

**File**: `src/lib/generation-copy.ts`

**Intent**: Keep all new Polish strings out of inline magic strings where practical.

**Contract**: Export constants used by Phase 1–3: exhaustion title, hints heading, cap message, Try another labels, rejected-count template. **Leave existing S-03 first-time no_match strings** (`NO_MATCH_TITLE`, hints at `MealGenerator.tsx:26-30`) inline — do not migrate to `generation-copy.ts` in this slice.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- First Generuj `no_match` → S-03 panel (pantry/time/meal-type hints).
- Try another → `no_match` with exclusions → exhaustion panel (session wording + constraint-relax hints).
- Rejected count visible after first Try another; resets on Generuj.
- Multiple Try anothers return different names (happy path with `OPENROUTER_API_KEY` on workerd preview).
- Mobile tab layout unchanged; Try another reachable on narrow viewport.
- Rate limit (429) still shows error styling, not exhaustion panel.

**Implementation Note**: Final manual sign-off on `pnpm run build && pnpm run preview` before marking change complete.

---

## Testing Strategy

### Unit Tests

- Not in scope — no test runner configured.

### Integration Tests

- Not in scope.

### Manual Testing Steps

1. Sign in, add pantry items, **Generuj** → recipe appears; no Try another before success.
2. Tap **Spróbuj inny** 2–3 times → different recipe names; **Odrzucono: N** increments.
3. Change meal type without Generuj → Try another still sends prior exclusions.
4. **Generuj** → rejected count resets; network shows `exclude_names: []`.
5. Force exhaustion (many Try anothers or tight pantry/constraints) → exhaustion panel, not first-time copy.
6. Hit 20 exclusions → Try another disabled + cap copy; **Generuj** recovers.
7. Empty pantry / load error → both buttons disabled as today.
8. Verify on workerd preview (not `astro dev` alone).

## Performance Considerations

- Each Try another is a full LLM call — same latency as Generuj; button loading state covers NFR (>1s feedback).
- Try another counts toward 10 req/user/hour rate limit — no special bypass.
- No extra renders beyond one new state field and conditional panels.

## Migration Notes

- None — no schema or API changes.

## References

- PRD US-06 / FR-010: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- S-03 patterns: `context/changes/strict-pantry-meal-generation/plan.md`
- F-02 `exclude_names` design: `context/changes/ai-meal-generation/plan.md`
- Layout: `context/foundation/dashboard-layout.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Session State & Shared Fetch

#### Automated

- [x] 1.1 Linting passes: `pnpm run lint`
- [x] 1.2 Production build passes: `pnpm run build`

#### Manual

- [x] 1.3 Generuj sends `exclude_names: []`; Try another sends accumulated names; Generuj resets session; constraint change does not reset

### Phase 2: Try Another UI

#### Automated

- [ ] 2.1 Linting passes: `pnpm run lint`
- [ ] 2.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 2.3 Try another visibility, keep-card loading, 20-cap disable, no double-submit

### Phase 3: Exhaustion Panel & Pool Indicator

#### Automated

- [ ] 3.1 Linting passes: `pnpm run lint`
- [ ] 3.2 Production build passes: `pnpm run build`

#### Manual

- [ ] 3.3 Exhaustion vs first-time no_match, rejected count, workerd preview sign-off
