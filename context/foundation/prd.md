---

## project: "MealDraft"

version: 1
status: draft
created: 2026-05-21
updated: 2026-07-02
context_type: greenfield
product_type: web-app
target_scale:
users: small
qps: low
data_volume: small
timeline_budget:
mvp_weeks: 3
hard_deadline: 2026-07-05
after_hours_only: true

## Vision & Problem Statement

Busy working adults waste time and food every day because the moment they open the fridge, they face a triple problem: decision paralysis ("what can I even make from this?"), a skill gap (not knowing what's possible with the ingredients on hand), and slow food waste as ingredients expire unused. Today the workaround is a mix — ordering takeout (money spent, food still wasted), doom-scrolling recipe blogs for 20+ minutes before giving up, falling back on the same three boring meals, or winging it with mediocre results.

Existing recipe apps (Tasty, SuperCook, MyFridgeFood) get two things wrong at once: they return a list of options, so the choice burden moves from the fridge to the search results; and they ignore hard constraints — time budget, available equipment, and actual fridge contents are treated as suggestions, not filters. MealDraft gives exactly one answer at a time that respects all constraints as non-negotiable, with a "Try another" option that excludes past results.

## User & Persona

### Primary persona

**Busy working adult who cooks at home.** Limited time after work, varied cooking skill level, pragmatic about meals. The moment they reach for MealDraft: standing in the kitchen after work, fridge has random ingredients, time is short, the question is always "co ugotować na teraz?" ("what to cook right now?"). They don't want inspiration — they want a decision made for them within their real constraints.

## Success Criteria

### Primary

- A user goes from pantry setup → constraints → one meal suggestion that uses ONLY declared pantry ingredients, respects the time budget, and matches the meal type — in one session.

### Secondary

- "Try another" reliably excludes previously shown results within the same session.

### Guardrails

- In Strict Pantry mode, generated meals NEVER include ingredients outside the user's declared pantry. Zero tolerance — this is the mode's contract for v1. Future strategies (e.g. Minimum Missing) will define their own constraints separately.
- Generated meal always respects the stated time constraint.

> **MVP v1 delivery (2026-07-02):** Primary and Secondary success criteria shipped (roadmap S-01–S-05). US-04 generation-history UI deferred — S-06 cancelled; favorites (S-05) serve as persistent recipe history. Active change folders archived to `context/archive/`; see @context/foundation/roadmap.md.

## User Stories

### US-01: User generates a meal from pantry contents

- **Given** a logged-in user with at least one product in their pantry
- **When** they set a time budget and meal type, then tap "Generate"
- **Then** they see exactly one meal suggestion that:
  - Uses only ingredients from their declared pantry
  - Fits within the stated time budget
  - Matches the selected meal type
  - Shows: dish name, prep time, ingredient list, step-by-step instructions

#### Acceptance Criteria

- Suggestion NEVER includes ingredients outside the user's pantry
- Suggestion respects the time constraint
- If no valid meal exists for the given constraints, the user sees a clear message in an info-style panel (not an empty screen or destructive error UI)
- _Try another_ is covered by US-06 / FR-010 (S-04); S-03 ships generate + no-match only

### US-02: User manages their pantry

- **Given** a logged-in user on the pantry screen
- **When** they add "chicken breast", see it in the list, edit it to "chicken thigh", then remove "flour"
- **Then** the pantry reflects all changes immediately; generation uses the updated pantry on the next "Generate"

#### Acceptance Criteria

- Added product appears in the pantry list without a page reload
- Edited product name updates in place
- Removed product disappears from the list immediately
- Pantry state persists across sessions (survives logout/login)

### US-03: User saves a meal to favorites

- **Given** a generated meal suggestion on screen
- **When** the user taps "Save to favorites"
- **Then** the meal appears in the favorites list and persists across sessions

#### Acceptance Criteria

- Favorite is saved with full recipe details (name, time, ingredients, steps)
- Duplicate saves of the same meal are prevented or handled gracefully
- Favorites list is accessible from the main navigation

### US-04: User browses generation history

- **Given** a user who has generated meals over multiple sessions
- **When** they open the history view
- **Then** they see their last N generated meals in reverse chronological order (most recent first)

#### Acceptance Criteria

- Each history entry shows at minimum: dish name, date generated, meal type
- History is limited to the last N entries (older entries are not displayed)
- History is read-only — no editing or deleting individual entries

### US-05: User registers and logs in

- **Given** a new visitor on the landing page
- **When** they register with email and password, log out, then log back in
- **Then** their pantry, favorites, and history are intact and private to their account

#### Acceptance Criteria

- Registration requires a valid email and a password
- Duplicate email registration is rejected with a clear message
- After login, the user lands on the pantry or generation screen (not a blank page)
- Unauthenticated access to any protected route redirects to login

### US-06: User rejects a suggestion and tries another

- **Given** a generated meal suggestion on screen
- **When** the user taps "Try another" multiple times
- **Then** each suggestion is different from all previously shown in the session; when options are exhausted, a clear message explains no more suggestions are available

#### Acceptance Criteria

- No suggestion repeats a previously shown result in the same session
- The user can see how many options remain (or an indication that the pool is shrinking)
- On exhaustion, the message suggests relaxing constraints (different meal type, longer time budget) rather than a dead end

## Functional Requirements

### Authentication

- FR-001: User can register with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Registration wall before seeing value kills conversion." Resolution: kept; auth-first is simpler to build for v1, anonymous trial is a v2 conversion optimization.
- FR-002: User can log in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Email + password is friction-heavy; OAuth/magic link would reduce drop-off." Resolution: kept for v1; OAuth/passwordless is a valid v2 improvement.

### Pantry Management

- FR-003: User can add a product to their virtual pantry. Priority: must-have
  > Socrates: Counter-argument considered: "Manual entry of 20 items is tedious — kills the 'quick answer' promise." Resolution: kept; manual entry is simplest for v1, barcode/voice input is v2.
- FR-004: User can view all products in their pantry. Priority: must-have
  > Socrates: Counter-argument considered: "A plain list adds no value over a notes app." Resolution: kept with enrichment note — add visual cues (e.g. ingredient count) to make the list useful beyond bare CRUD.
- FR-005: User can update a product in their pantry. Priority: must-have
  > Socrates: Counter-argument considered: "Update is hollow if a product is just a name — it's delete + re-add." Resolution: kept; even if it's name edits now, the FR carries quantity/expiry when those arrive in v2.
- FR-006: User can remove a product from their pantry. Priority: must-have
  > Socrates: Counter-argument considered: "If users forget to remove used-up ingredients, generation suggests meals with missing items — breaks Strict Pantry at a UX level." Resolution: kept; user discipline is acceptable for v1, smart deduction is v2.

### Meal Generation

- FR-007: User can set a time budget constraint via quick-pick presets **15 / 30 / 60 min** or **"Any time"**. Selected time represents the maximum preparation time; "Any time" means no time restriction (`max_prep_time_minutes: null`). Custom text input is explicitly excluded from v1. Default selection is **"Any time"**. Priority: must-have
  > Socrates: Counter-argument considered: "Fixed presets are arbitrary — 25 min forces a choice between 15 or 30." Resolution: revised; presets cover common time windows plus "Any time" as the default no-restriction option. Custom input excluded from v1 to keep the UI simple.
- FR-008: User can set a meal type constraint (breakfast/lunch/dinner). Priority: must-have
  > Socrates: Counter-argument considered: "Meal type categories are culturally loaded and fuzzy — 'quick snack' doesn't fit." Resolution: kept; three types are clear enough for v1.
- FR-009: User can generate exactly one meal suggestion that uses only pantry ingredients and respects all constraints. When no valid meal exists, the user sees a clear info-style message with actionable hints (not a blank screen or error toast). Priority: must-have
  > Socrates: Counter-argument considered: "AI might fail for a sparse pantry — zero-result state is worse than imperfect results." Resolution: kept; a clear 'nothing found' message is acceptable for v1.
- FR-010: User can hit "Try another" to get a new suggestion that excludes previously shown results in the session. Priority: must-have
  > Socrates: Counter-argument considered: "Exclusion pool shrinks per tap — after 3–5 taps user hits a wall that feels broken." Resolution: kept with note — show how many options remain so the user knows when they're running low.

### Favorites & History

- FR-011: User can save a generated meal to favorites. Priority: must-have
  > Socrates: Counter-argument considered: "Favorites duplicate history if the user rarely revisits old meals." Resolution: kept; favorites are intentional bookmarks, history is a passive log — different purpose.
- FR-012: User can view their favorites list. Priority: must-have
  > Socrates: Counter-argument considered: "A favorites list without 'cook again' / ingredient re-check is a dead list." Resolution: kept; read-only list is enough for v1.
- FR-013: User can view their generation history (limited to last N entries). Priority: must-have
  > Socrates: Counter-argument considered: "History grows unbounded — becomes an unusable scroll dump after a month." Resolution: revised; limit to last N entries for v1.

## Non-Functional Requirements

- MVP user-facing UI copy is **Polish** (inline strings; no i18n layer in v1).
- Continuous visible feedback during any operation that takes longer than 1 second.
- Pantry data, constraint preferences, favorites, and generation history are private to the user's account — no cross-user visibility, no sharing.
- The product remains usable on the latest two major versions of Chrome, Firefox, Safari, and Edge, on both desktop and mobile viewports (responsive).
- Availability is best-effort for v1 — no formal SLA. This is a side project; brief downtime is acceptable.

## Business Logic

Given a set of declared pantry ingredients, a time budget, and a meal type, MealDraft selects exactly one meal that is fully preparable from those inputs, with no ingredient substitution.

The rule consumes three user-facing inputs: the user's declared pantry (a list of product names), a time budget (chosen from presets representing maximum preparation time, or "Any time" for no restriction), and a meal type (breakfast, lunch, or dinner). Its output is exactly one meal suggestion — dish name, estimated prep time, ingredient list (all drawn from the pantry), and step-by-step preparation instructions.

The user encounters this rule by setting constraints and tapping "Generate." The app returns one concrete answer — not a list to browse. If the answer doesn't appeal, "Try another" produces a different suggestion that excludes all previously shown results in the same session.

## Access Control

Email + password login. Flat user model — every user is equal, no admin/member/guest distinction. Accounts exist to provide privacy and data isolation: each user's pantry, constraint preferences, favorites, and generation history are private to their account. Unauthenticated users are redirected to login/register — no guest access to the core flow.

## Non-Goals

- **No weekly meal planning or diet scheduling.** MealDraft solves the "what to cook right now" moment, not long-term nutrition planning. Adding scheduling would triple the scope and blur the product identity.
- **No calorie counting, macros, or dietetics module.** The product is a decision engine, not a health tracker. Dietetics requires verified nutritional data and regulatory caution — out of scope.
- **No grocery store integration or auto-generated shopping lists.** The MVP operates on what the user already has. Shopping list generation is a v2 feature once the core loop is proven.
- **No automatic pantry deduction after cooking.** Smart inventory (auto-removing used ingredients with precise quantities) is a complex automation layer. For v1, the user manually manages their pantry.
- **No dedicated mobile app.** v1 is a responsive web app only. Native mobile is a future platform decision.
- **No social features.** No sharing meals, public profiles, or community recipes. MealDraft is a personal tool in v1.
- **No offline-first guarantee.** Meal generation depends on an external service — internet connectivity is required. Offline caching is not a v1 goal.

## Open Questions

1. **What is the specific value of N for generation history limit?** FR-013 caps history to "last N entries" but the exact number is not decided. Owner: user. Block: no (can be set during implementation, but affects UX expectations).
2. ~~**What are the exact time budget presets?**~~ **Resolved (S-03, 2026-06-03):** **15 / 30 / 60** min + **Any time** (default); no custom input.
3. **What happens when a user removes a favorited meal's ingredients from pantry?** The favorite persists but its ingredients no longer match the pantry. Is this surfaced to the user, or is the favorite purely a historical bookmark? Owner: user. Block: no.
