---
change_id: pantry-crud
title: Build pantry add/view/edit/remove UI and API
status: implemented
created: 2026-05-31
updated: 2026-06-06
reviewed: 2026-05-31
triaged: 2026-05-31
archived_at: null
---

## Notes

S-02 from @context/foundation/roadmap.md.

### Outcome

User can add, view, edit, and remove pantry products with immediate UI updates; pantry state persists across sessions.

### Prerequisites

F-01, S-01

### PRD refs

US-02, FR-003, FR-004, FR-005, FR-006

### Dashboard mobile UX (shipped in S-03)

Phase 3 hid the meal-generator placeholder on mobile and kept pantry full-width. Tab-based switching (*Spiżarnia* | *Generator posiłków*) shipped in S-03 — see @context/foundation/dashboard-layout.md.

### Review triage (2026-05-31)

All 6 impl-review findings fixed. One follow-up deferred: user-visible `loadError` prop for dashboard prefetch failures — see `follow-ups/review-fixes.md`.
