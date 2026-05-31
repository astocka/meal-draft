# Pantry CRUD Implementation Plan

## Overview

Build S-02: a full pantry management experience embedded directly in the `/dashboard` page. Three layers ship together: four JSON API endpoints for pantry CRUD, a `PantryWidget` React island with optimistic updates and inline editing, and a redesigned dashboard shell that becomes the two-column application home screen (pantry left, meal generator placeholder right).

## Current State Analysis

- `pantry_products` table is live with `id`, `user_id`, `name`, `created_at`, `updated_at`; unique index on `(user_id, lower(trim(name)))` rejects duplicate names at the DB layer; RLS policies cover SELECT/INSERT/UPDATE/DELETE for `authenticated` role — F-01 complete.
- `PantryProduct` TypeScript type in `src/types.ts` is aligned to the table schema.
- `src/lib/supabase.ts` exports `createClient(requestHeaders, cookies)` — the SSR client factory all new routes will use.
- `src/middleware.ts` already protects `/dashboard`; middleware resolves `context.locals.user` on every request — API routes read it without calling `auth.getUser()` again.
- API route pattern established in `src/pages/api/auth/` — `prerender = false`, Zod validation, `createClient()`, JSON or redirect response.
- React island pattern established in `src/components/auth/` — `useState`, lucide icons, `Button` from shadcn, `cn()` from `@/lib/utils`.
- `src/pages/dashboard.astro` is a placeholder stub: centered card, `bg-cosmic` theme, sign-out form — it will be fully replaced.
- No JSON-response API routes exist yet; this slice introduces the pattern.
- Only `button.tsx` from shadcn/ui is installed.

## Desired End State

After this plan completes:

1. A logged-in user lands on `/dashboard` and sees a full two-column app screen: pantry management on the left, meal generator placeholder on the right.
2. The user can type a product name into the fixed input zone, press Enter or click `+`, and see the item appear alphabetically in the scrollable list below — no page reload.
3. The user can click a product name to edit it inline; Enter/blur confirms; duplicate names show an error below the edit field.
4. A delete button next to each item removes it immediately from the list.
5. All changes persist across sessions (backed by Supabase).
6. An empty pantry shows a friendly prompt rather than a blank list.
7. Sign-out is accessible from a top-right corner element on every app page.

### Key Discoveries

- `context.locals.user` from middleware provides `user.id` — API routes do not need to re-authenticate, just null-check.
- Supabase unique constraint violation surfaces as `PostgrestError.code === '23505'` — map to HTTP 409 in the API layer.
- `pantry_products` RLS already scopes all queries to `auth.uid() = user_id` — the explicit `.eq('user_id', user.id)` filter in query code is defense-in-depth, not the primary guard.
- The `bg-cosmic` custom class is already defined in the global stylesheet — keep it for the redesigned dashboard.
- No shadcn `Input` component is installed; use a plain `<input>` styled with Tailwind + `cn()`, following the `FormField` pattern in `src/components/auth/FormField.tsx`.

## What We're NOT Doing

- No barcode or voice input — manual name entry only (PRD FR-003 Socrates resolution).
- No product quantity, expiry, or category fields — name-only in v1.
- No dedicated `/pantry` route — pantry is embedded in `/dashboard`.
- No service layer (`src/lib/pantry.ts`) — Supabase calls live directly in API route handlers, consistent with the auth routes.
- No toast/notification library — errors are inline only.
- No real MealGenerator component — right column is a placeholder until S-03 / F-02.
- No pagination or search — pantry lists are small enough for full display in v1.

## Implementation Approach

Three phases in dependency order:

1. **API layer first** — four endpoints provide the data contract the React island depends on. All are testable independently via `curl` or the Supabase dashboard before the UI exists.
2. **PantryWidget second** — the React island consumes the API. It manages optimistic local state (add/delete fully optimistic; rename semi-optimistic — keeps edit mode active during the call to avoid a revert flash on 409).
3. **Dashboard shell last** — wraps everything: server-fetches initial items, renders the two-column layout, mounts the widget with `client:load`.

## Critical Implementation Details

**Duplicate-name error code:** Supabase returns `PostgrestError` with `code: '23505'` for unique index violations. The API routes must check `error.code === '23505'` and return HTTP 409 with `{ error: 'already-in-pantry' }` so the React island can display "'{name}' is already in your pantry" without pattern-matching on Supabase internals.

**Rename UX — no revert flash:** Add and delete are fully optimistic. Rename is semi-optimistic: the edit input stays mounted and shows a spinner during the PATCH call. On success the list updates and edit mode exits; on 409 the error appears below the edit input and the user corrects in place. This avoids the jarring "update → revert → re-enter edit mode" sequence that would occur if rename were also fully optimistic.

**Alphabetical insertion for optimistic add:** When a new item is added optimistically, insert it at the correct sorted position rather than appending to avoid a visible re-sort jump when the server response arrives. Use a locale-aware compare: `a.name.localeCompare(b.name)`.

**Initial items server-fetch:** `dashboard.astro` fetches pantry items server-side and passes them as `initialItems` props to `<PantryWidget client:load>`. The widget initializes its state from these props — no client-side fetch on mount, instant paint.

---

## Phase 1: Pantry API Endpoints

### Overview

Create four JSON API endpoints covering the full pantry CRUD surface. These are the first JSON-returning (non-redirect) API routes in the codebase — they set the response-format convention for future slices.

### Changes Required

#### 1. List and add endpoint

**File**: `src/pages/api/pantry/index.ts`

**Intent**: Handle GET (list user's pantry, alphabetically sorted) and POST (add a new item). These two operations share auth and client setup, so they co-locate in `index.ts`.

**Contract**:
- `export const prerender = false`
- Both handlers: null-check `context.locals.user`; if null return `Response` with `status: 401` and JSON body `{ error: 'Unauthorized' }`.
- Both handlers: call `createClient(context.request.headers, context.cookies)`; if null return 503.
- `GET`: query `supabase.from('pantry_products').select('*').order('name', { ascending: true })`; return `200` with `{ items: PantryProduct[] }`.
- `POST`: parse body via `context.request.json()`; validate with Zod schema `z.object({ name: z.string().min(1).max(100) })`; trim whitespace; insert `{ user_id: user.id, name: trimmedName }`; on `error.code === '23505'` return `409 { error: 'already-in-pantry' }`; on other DB error return `500`; on success return `201` with `{ item: PantryProduct }`.

#### 2. Update and delete endpoint

**File**: `src/pages/api/pantry/[id].ts`

**Intent**: Handle PATCH (rename a product) and DELETE (remove a product). Both are keyed on the `id` path parameter and scoped to the authenticated user.

**Contract**:
- `export const prerender = false`
- Both handlers: same auth null-check and client creation as `index.ts`.
- `PATCH`: parse body; validate with `z.object({ name: z.string().min(1).max(100) })`; trim; call `.update({ name: trimmedName }).eq('id', context.params.id).eq('user_id', user.id).select().single()`; on `23505` return 409; on null data (no matching row) return 404; on success return `200 { item: PantryProduct }`.
- `DELETE`: call `.delete().eq('id', context.params.id).eq('user_id', user.id)`; return `204` with no body on success; return 500 on DB error.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes (also covers TypeScript type errors): `pnpm run build`

#### Manual Verification

- `GET /api/pantry` with a valid session cookie returns `200 { items: [] }` for a fresh user
- `POST /api/pantry` with `{ name: "Chicken" }` returns `201` and the item appears in subsequent GET
- `POST /api/pantry` with `{ name: "chicken" }` (duplicate, different case) returns `409 { error: 'already-in-pantry' }`
- `PATCH /api/pantry/<id>` with `{ name: "Chicken breast" }` returns `200` with updated item
- `DELETE /api/pantry/<id>` returns `204` and item is absent from subsequent GET
- All endpoints return `401` when called without a session (unauthenticated request)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: PantryWidget React Island

### Overview

Build the interactive pantry management component. It receives `initialItems` from the server, manages optimistic local state, and calls the Phase 1 API endpoints for all mutations.

### Changes Required

#### 1. PantryWidget component

**File**: `src/components/pantry/PantryWidget.tsx`

**Intent**: Render the full pantry CRUD UI — fixed add zone at top, scrollable alphabetical item list below, inline edit mode per row, empty state message. All mutations go through the Phase 1 JSON API; state is managed optimistically for add/delete and semi-optimistically for rename.

**Contract**:

Props interface: `{ initialItems: PantryProduct[] }`

State:
- `items: PantryProduct[]` — initialized from `initialItems`; always kept sorted alphabetically (`localeCompare`)
- `newName: string` — value of the add input
- `addError: string | null` — inline error message below the add input
- `editingId: string | null` — id of the item currently in edit mode; `null` when no item is being edited
- `editName: string` — current value of the inline edit input
- `editLoading: boolean` — true while the PATCH call is in flight (disables edit input + shows spinner)
- `editError: string | null` — inline error below the edit input for the active edit row

Add operation (fully optimistic):
1. Client-side validate: trim `newName`, reject empty, set `addError` if blank.
2. Create a temp item with `id: 'temp-' + Date.now()`, insert into `items` at the correct alphabetical position.
3. Clear `newName` and `addError`.
4. POST `/api/pantry` with `{ name: trimmedName }`.
5. On success: replace temp item with the returned item from the response.
6. On 409: remove temp item, set `addError` to `"'${trimmedName}' is already in your pantry"`.
7. On other error: remove temp item, set `addError` to `"Failed to add item — please try again"`.

Delete operation (fully optimistic):
1. Store removed item and its sorted index.
2. Remove from `items` immediately.
3. DELETE `/api/pantry/${id}`.
4. On error: re-insert the removed item at the saved index.

Rename operation (semi-optimistic — edit input stays active):
1. Validate trimmed `editName` non-empty.
2. Set `editLoading: true`.
3. PATCH `/api/pantry/${editingId}` with `{ name: trimmedEditName }`.
4. On success: update item name in `items`, re-sort, set `editingId: null`, `editLoading: false`.
5. On 409: set `editLoading: false`, set `editError` to `"'${trimmedEditName}' is already in your pantry"`.
6. On other error: set `editLoading: false`, set `editError` to `"Failed to rename — please try again"`.

UI layout:
- Outer: `flex flex-col h-full` container
- Add zone (not scrolling): text input + `+` button on the same row; `addError` message below if set
- Empty state (when `items.length === 0`): short message rendered in the list area — "Your pantry is empty — add your first ingredient above"
- List area: `flex-1 overflow-y-auto min-h-0`; each row shows item name (or edit input) + delete button; active edit row shows edit input + confirm/cancel buttons + `editError` below

Keyboard behavior: Enter in the add input triggers add; Enter in the edit input triggers save; Escape in the edit input cancels (restores `editingId: null` without saving).

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Adding "Tomato" appears immediately in the list at the correct alphabetical position
- Adding "tomato" (duplicate) shows inline error below the add input; the list is unchanged
- Clicking a product name enters inline edit mode for that item only
- Renaming to an existing item name shows inline error in the edit field; list is unchanged
- Renaming to a new name updates the list item and re-sorts alphabetically
- Delete button removes the item immediately
- On a fresh user with no pantry items, the empty-state message is displayed
- List scrolls independently when items exceed the available height; add zone stays fixed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard App Shell Redesign

### Overview

Replace the placeholder `dashboard.astro` with the full application home screen: top bar with sign-out, two-column body (PantryWidget left, MealGeneratorPlaceholder right). Initial pantry items are server-fetched and passed as props.

### Changes Required

#### 1. Dashboard page redesign

**File**: `src/pages/dashboard.astro`

**Intent**: Transform the placeholder into the application shell. Server-fetch the user's pantry items, render the two-column layout, mount `PantryWidget` with `client:load` on the left, and a static placeholder on the right.

**Contract**:
- Server-side: call `createClient(Astro.request.headers, Astro.cookies)`, query `pantry_products` (same query as GET /api/pantry), default to `[]` on error.
- Top bar: render `<DashboardTopbar />` (see file 2 below) as a fixed or sticky header — app name/logo on the left, sign-out form on the right. Do **not** reuse `src/components/Topbar.astro`: it carries a "Dashboard" nav link that creates a broken nav loop when rendered on `/dashboard` itself. Keep the `bg-cosmic` theming.
- Main area: responsive two-column grid (`grid-cols-1 md:grid-cols-2`) with equal columns, full viewport height minus the top bar.
- Left column: `<PantryWidget client:load initialItems={initialItems} />` — pass server-fetched `PantryProduct[]`.
- Right column: `<MealGeneratorPlaceholder />` Astro component.
- Each column should be `h-full flex flex-col` so PantryWidget's scrollable list fills the available height.

#### 2. Dashboard top bar

**File**: `src/components/dashboard/DashboardTopbar.astro`

**Intent**: Provide the authenticated app-shell header — app name on the left, sign-out form on the right. Intentionally separate from `src/components/Topbar.astro`, which targets pre-auth/landing pages and includes navigation links unsuitable for the dashboard.

**Contract**: Static Astro component; reads `Astro.locals.user` for the sign-out form; renders a single row with the app name/logo left-aligned and `<form method="POST" action="/api/auth/signout">` right-aligned. No `client:*` directive.

#### 3. Meal generator placeholder

**File**: `src/components/meal/MealGeneratorPlaceholder.astro`

**Intent**: Reserve the right column for the S-03 meal generator with a clearly labeled placeholder that communicates what will go there. Not interactive.

**Contract**: Static Astro component; renders a styled panel matching the left column's visual weight; displays "Meal Generator" label and a short "Coming in the next step" or similar copy. No interactivity, no `client:*` directive.

### Success Criteria

#### Automated Verification

- Linting passes: `pnpm run lint`
- Production build passes: `pnpm run build`

#### Manual Verification

- Signing in redirects to `/dashboard` and shows the two-column layout (no more centered card)
- Pantry items from the database appear immediately on load (server-rendered)
- Sign-out button in the top bar completes sign-out and redirects to `/auth/signin`
- On mobile viewport (< 768 px) the two columns stack vertically
- Full add/edit/delete flow works end-to-end (item survives logout + re-login)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

No test suite configured in this repo (AGENTS.md). Correctness is verified via build, lint, and manual end-to-end testing.

### Integration Tests

Deferred — no test runner configured.

### Manual Testing Steps

1. Start the Cloudflare dev environment: `pnpm run dev` (or `pnpm run preview` for workerd accuracy)
2. Register a new test user or sign in with an existing one
3. Verify the dashboard renders the two-column layout
4. **Add flow**: type "Flour" → press Enter → item appears in list
5. **Alphabetical sort**: add "Apple" → appears above "Flour"
6. **Duplicate rejection**: type "flour" (lowercase) → inline error appears; list unchanged
7. **Inline edit**: click "Flour" → edit field appears; rename to "Whole wheat flour" → list updates and re-sorts
8. **Edit duplicate**: rename "Apple" to "Whole wheat flour" → inline error in edit field
9. **Delete**: delete "Whole wheat flour" → item removed immediately
10. **Session persistence**: sign out, sign back in → remaining items are still present
11. **Empty state**: create a fresh user with no items → empty-state message displayed
12. **Mobile layout**: resize browser to < 768 px → columns stack vertically

## Performance Considerations

- Server-side initial data fetch eliminates a client-side loading flash on first paint — pantry list is visible immediately.
- Optimistic updates ensure perceived latency is near-zero for add and delete even on slow connections.
- The alphabetical sort runs on a small in-memory array (pantry lists are small) — no performance concern.

## References

- Change identity: `context/changes/pantry-crud/change.md`
- PRD: `context/foundation/prd.md` — US-02, FR-003, FR-004, FR-005, FR-006
- Roadmap S-02: `context/foundation/roadmap.md`
- Domain schema plan: `context/changes/domain-data-schema/plan.md`
- Supabase client: `src/lib/supabase.ts`
- Type definitions: `src/types.ts`
- Auth API route pattern: `src/pages/api/auth/signin.ts`
- React island pattern: `src/components/auth/SignInForm.tsx`
- Dashboard (to replace): `src/pages/dashboard.astro`
- Lessons: `context/foundation/lessons.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Pantry API Endpoints

#### Automated

- [x] 1.1 Linting passes: `pnpm run lint`
- [x] 1.2 Production build passes: `pnpm run build`

#### Manual

- [x] 1.3 GET /api/pantry returns 200 with empty items for a fresh user
- [x] 1.4 POST /api/pantry adds item; appears in subsequent GET
- [x] 1.5 POST /api/pantry with duplicate name (case-insensitive) returns 409
- [x] 1.6 PATCH /api/pantry/[id] renames item and returns updated item
- [x] 1.7 DELETE /api/pantry/[id] returns 204; item absent from subsequent GET
- [x] 1.8 All endpoints return 401 for unauthenticated requests

### Phase 2: PantryWidget React Island

#### Automated

- [x] 2.1 Linting passes: `pnpm run lint`
- [x] 2.2 Production build passes: `pnpm run build`

#### Manual

- [x] 2.3 Adding item appears immediately at correct alphabetical position
- [x] 2.4 Adding duplicate name shows inline error; list unchanged
- [x] 2.5 Clicking item name enters inline edit mode
- [x] 2.6 Renaming to existing name shows inline error in edit field
- [x] 2.7 Renaming to new name updates list and re-sorts
- [x] 2.8 Delete removes item immediately
- [x] 2.9 Empty-state message shown when pantry is empty
- [x] 2.10 List scrolls independently; add zone stays fixed

### Phase 3: Dashboard App Shell Redesign

#### Automated

- [x] 3.1 Linting passes: `pnpm run lint`
- [x] 3.2 Production build passes: `pnpm run build`

#### Manual

- [x] 3.3 Dashboard shows two-column layout after sign-in
- [x] 3.4 Server-rendered pantry items appear instantly on load
- [x] 3.5 Sign-out button in top bar works correctly
- [x] 3.6 Mobile viewport: pantry full-width; generator column hidden (tabs in S-03)
- [x] 3.7 Full CRUD round-trip persists across logout/login
