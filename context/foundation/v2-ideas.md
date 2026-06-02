# MealDraft — v2 Ideas (Parking Lot)

> Purpose: capture good ideas that are **out of MVP scope** so they don’t get lost or derail current execution.
> This is not a commitment; it’s a shortlist of “worth revisiting after MVP ships”.
>
> Convention:
> - Keep entries small and concrete.
> - Prefer “v2” over “someday”.
> - Link to relevant PRD / roadmap sections when applicable.

## Product

### Multi-language support (i18n)

- **v1**: Polish only (PL)
- **v2**: English (EN)
- **v2**: Spanish (ES)

Notes:
- The generation pipeline currently relies on string matching for pantry + staples validation, so the **LLM output language must match pantry language**.
- A clean v2 implementation is “locale-driven generation”: select system prompt language + `COOKING_STAPLES` set by locale (and ideally normalise pantry entries by locale or store canonical IDs).

