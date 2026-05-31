# Dashboard layout (desktop + mobile)

> UX decisions for `/dashboard`: two-column app shell (pantry + meal generator). Updated during S-02 (`pantry-crud`); mobile tab pattern is input for S-03 (`strict-pantry-meal-generation`).

## Desktop (≥ 768px)

- Two equal columns: **My Pantry** (left), **Meal Generator** (right).
- Pantry list scrolls inside the left column; add input stays fixed at the top of that column.
- When the generator is live (S-03), both panels can stay visible side-by-side — user sees pantry and results without navigation.

## Mobile (< 768px)

### Current behavior (S-02)

- **Meal generator column is hidden** (`hidden md:flex` on the right column). Pantry uses full viewport below the top bar.
- **Rationale:** The right column is a non-interactive placeholder. Stacking it below the pantry wasted ~25% of screen height and forced scrolling past empty “coming soon” content before the pantry felt usable.
- **Delete control:** Trash icon is always visible on touch (`opacity-100`); on `sm+` it remains hover-reveal (`sm:opacity-0 sm:group-hover:opacity-100`) because hover does not exist on phones.

### Planned behavior (S-03)

When `MealGenerator` is real, **do not** rely on stacked columns on mobile. Users would scroll past the entire pantry to reach generation and results.

**Recommended pattern: tab navigation**

- Below `DashboardTopbar`, show two tabs on mobile only: `Pantry` | `Meal Generator`.
- One panel visible at a time, each filling the remaining viewport height (same scroll contract as today’s pantry column).
- Desktop: no tabs — keep the existing two-column grid unchanged.
- Implementation sketch: tabs in `dashboard.astro` or a small React island; `hidden md:grid` for the tab bar; column visibility toggled by active tab on small screens only.

### Alternatives considered (not chosen for v1)

| Approach | Why not (for mobile) |
|----------|----------------------|
| Stack both columns vertically | Placeholder/generator steals vertical space; poor when pantry list grows |
| Always show both, smaller | Unreadable; cramped inputs and meal cards |
| Separate `/generate` route | Extra navigation; splits the “one screen” mental model from the PRD dashboard home |

## Traceability

| Slice | What ships |
|-------|------------|
| S-02 (`pantry-crud`) | Two-column shell, placeholder right, pantry CRUD, mobile hide placeholder + touch delete |
| S-03 (`strict-pantry-meal-generation`) | Real generator + **mobile tabs** (plan explicitly) |
| S-04+ | Same shell; tabs still apply on mobile unless a later change revises this doc |

## References

- Roadmap: `context/foundation/roadmap.md` — S-02, S-03
- Implementation: `src/pages/dashboard.astro`, `src/components/pantry/PantryWidget.tsx`
