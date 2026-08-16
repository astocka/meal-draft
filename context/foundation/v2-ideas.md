# MealDraft — v2 Ideas (Parking Lot)

> Purpose: capture good ideas that are **out of MVP scope** so they don’t get lost or derail current execution.
> This is not a commitment; it’s a shortlist of “worth revisiting after MVP ships”.
>
> Convention:
>
> - Keep entries small and concrete.
> - Prefer “v2” over “someday”.
> - Link to relevant PRD / roadmap sections when applicable.

## Product

### Account-level preference settings (post S-07)

- v1 persists the user's diet_type preference in localStorage (client-side, single-device).
- A future slice could add a `user_preferences` table + `/api/preferences` endpoint so preferences sync across devices and are visible in an account settings page.
- Candidate preferences beyond diet: default prep time, default meal type.

### Extended diet type options (post S-07)

- **S-07** ships an initial set of diet types chosen during planning. Additional diet categories (e.g. keto, paleo, low-carb, halal, kosher, low-calorie) are deferred here — each carries extra complexity around prompt enforcement or cultural correctness that is out of scope for the first diet-filter slice.
- Revisit after S-07 is live and user feedback clarifies which extra options are actually needed.
- Note: options that require macronutrient tracking (keto, low-calorie) may need pantry-level nutritional data before they can be enforced reliably.

### Multi-language support (i18n)

- **v1**: Polish only (PL)
- **v2**: English (EN)
- **v2**: Spanish (ES)

Notes:

- The generation pipeline currently relies on string matching for pantry + staples validation, so the **LLM output language must match pantry language**.
- A clean v2 implementation is “locale-driven generation”: select system prompt language + `COOKING_STAPLES` set by locale (and ideally normalise pantry entries by locale or store canonical IDs).
