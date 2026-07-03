---
change_id: strict-pantry-meal-generation
title: Ship strict-pantry meal generation (north star S-03)
status: archived
created: 2026-06-03
updated: 2026-07-02
archived_at: 2026-07-02T17:11:26Z
---

## Notes

S-03 from @context/foundation/roadmap.md.

### Decisions

- **Time budget (2026-06-03):** Presets **15 / 30 / 60** min + **Any time**; default **Any time** (`max_prep_time_minutes: null` on load).
- **UI (2026-06-03):** **shadcn + Tailwind**; add shadcn components for S-03 (tabs, card, etc.); **light color/theme customization** in S-03 via `global.css` tokens + Tailwind classes to match cosmic/purple dashboard — no second UI framework.
- **Pantry load error (2026-06-03):** Ship `loadError` in S-03 — if dashboard prefetch fails, show: _Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później._
- **No match (2026-06-03):** Info panel (not error toast) — title _Nie udało się stworzyć przepisu_; hints under _Co możesz zrobić?_; omit _Wydłuż czas przygotowania_ when **Any time** selected.
- **Empty pantry (2026-06-03):** _Twoja spiżarnia jest pusta – dodaj swój pierwszy składnik_ (replaces English in `PantryWidget`).
- **Language (2026-06-03):** Polish only for all user-facing UI in v1 MVP (S-03 scope); no i18n.

### Outcome

User can set a time budget and meal type, tap Generate, and see exactly one meal suggestion using only declared pantry ingredients, respecting all constraints, with a clear message when no valid meal exists.

### Prerequisites

F-01 (domain-data-schema), F-02 (ai-meal-generation), S-02 (pantry-crud)

### PRD refs

US-01, FR-007, FR-008, FR-009
