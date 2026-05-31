# Review Fix Follow-ups

## Deferred from impl-review 2026-05-31

### loadError prop for dashboard prefetch failures

**Source**: F5 triage decision
**Context**: `src/pages/dashboard.astro` now logs a `console.error` when the Supabase prefetch fails, but the user still sees a silent empty pantry.

**Task**: Pass a `loadError: boolean` prop from `dashboard.astro` to `PantryWidget`, and render a user-visible message when true:

> "We're having trouble loading your pantry, please refresh the page"

**Files to change**:
- `src/pages/dashboard.astro` — pass `loadError={!!error}` prop
- `src/components/pantry/PantryWidget.tsx` — add `loadError?: boolean` to Props interface; render the message in place of (or above) the list area when `loadError` is true
