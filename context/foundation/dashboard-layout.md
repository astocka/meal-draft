# Dashboard layout (desktop + mobile)

> UX decisions for `/dashboard`: two-column app shell (pantry + meal generator). S-02 established the shell; S-03 shipped the live generator and mobile tabs.

## Desktop (≥ 768px)

- Two columns **1/3 · 2/3**: **Spiżarnia** (left, narrower), **Generator posiłków** (right, wider).
- Pantry list scrolls inside the left column; add input stays fixed at the top of that column.
- Both panels stay visible side-by-side — user sees pantry and generation/results without navigation.
- **`loadError` (prefetch failed):** Polish banner in the **pantry column** on all viewports; generator column disables **Generuj** without duplicating the banner on desktop (mobile generator tab still shows the banner).
- **`no_match`:** Shown in the generator column as an info-style panel (not destructive error UI).

## Mobile (< 768px)

### Current behavior (S-03)

- Below `DashboardTopbar`, **shadcn tabs** on mobile only: **Spiżarnia** | **Generator posiłków** (`DashboardShell`).
- One panel visible at a time, each filling the remaining viewport height (same scroll contract as the pantry column).
- Desktop (`md+`): no tab bar — `md:grid-cols-[1fr_2fr]` shows both columns (pantry one third, generator two thirds).
- **Delete control:** Trash icon is always visible on touch (`opacity-100`); on `sm+` it remains hover-reveal (`sm:opacity-0 sm:group-hover:opacity-100`) because hover does not exist on phones.

### S-02 behavior (superseded on mobile)

- Meal generator column was hidden (`hidden md:flex`); pantry full-width. Replaced by tabs in S-03 so users do not scroll past the pantry to reach **Generuj**.

### Alternatives considered (not chosen for v1)

| Approach | Why not (for mobile) |
|----------|----------------------|
| Stack both columns vertically | Generator/results steal vertical space; poor when pantry list grows |
| Always show both, smaller | Unreadable; cramped inputs and meal cards |
| Separate `/generate` route | Extra navigation; splits the “one screen” mental model from the PRD dashboard home |

## Traceability

| Slice | What ships |
|-------|------------|
| S-02 (`pantry-crud`) | Two-column shell, placeholder right, pantry CRUD, mobile hide placeholder + touch delete |
| S-03 (`strict-pantry-meal-generation`) | `MealGenerator`, `DashboardShell` mobile tabs, `loadError`, Polish copy — **done** |
| S-04+ | Same shell; **Try another** in generator column; tabs still apply on mobile unless a later change revises this doc |

## References

- Roadmap: `context/foundation/roadmap.md` — S-02, S-03 (done)
- Implementation: `src/pages/dashboard.astro`, `src/components/dashboard/DashboardShell.tsx`, `src/components/meal/MealGenerator.tsx`, `src/components/pantry/PantryWidget.tsx`
