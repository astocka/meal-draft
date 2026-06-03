# Strict-Pantry Meal Generation (S-03) — Plan Brief

> Full plan: `context/changes/strict-pantry-meal-generation/plan.md`
> Research: `context/changes/strict-pantry-meal-generation/research.md`

## What & Why

User sets meal type and time budget, taps **Generuj**, and gets exactly one strict-pantry suggestion from declared pantry ingredients—or a clear Polish message when none exists. This is roadmap **S-03**, the north star that proves MealDraft is constraint-driven, not another recipe feed.

## Starting Point

**Shipped (2026-06-03).** `MealGenerator` calls `POST /api/generate`; `DashboardShell` provides desktop two-column layout and mobile tabs; Polish UX, `loadError`, and workerd verification complete per `plan.md`.

## Desired End State

On `/dashboard`, desktop shows pantry + live generator side by side; mobile uses **Spiżarnia | Generator posiłków** tabs. **Generuj** calls the API with presets 15/30/60 or Dowolny czas (default), shows one recipe or an info-style **no_match** panel, handles load failures and rate limits distinctly, and disables generate when the pantry is empty or failed to load.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ------------------ | ------ |
| Scope | Frontend-only slice | API and schema are done; S-03 is dashboard UX | Research |
| Time presets | 15 / 30 / 60 + Dowolny czas; default null | Matches FR-007 product choice | Research / change.md |
| UI stack | shadcn + Tailwind; token pass in S-03 | Matches project; cosmic/purple alignment | Research |
| Language | Polish only v1 | MVP audience; no i18n | Research |
| no_match UX | Info panel + conditional hints | Calm guidance; hide time hint when Any time | Research |
| loadError | Ship in S-03; duplicate in generator tab | Avoid empty-pantry confusion on prefetch failure | Research / Plan |
| Mobile nav | `DashboardShell` React island + shadcn Tabs | One place for tab state and shared props | Plan |
| Empty pantry | Disable Generuj + hint; `onItemsChange` | Avoid useless LLM wait; enable after first add | Plan |
| history_id | React state only | Forward-compat for S-04/S-06 without URL noise | Plan |
| Wire types | Zod response schemas in `generation-schema.ts` | Same source as request; runtime-safe parse | Plan |
| 429 UX | Dedicated inline Polish error | Distinct from no_match and generic 500 | Plan |
| Testing | lint + build + manual workerd | No test runner in repo today | Plan |

## Scope

**In scope:** `MealGenerator`, `DashboardShell`, mobile tabs, Zod client parsing, shadcn tabs/card, theme token nudge, `loadError`, Polish copy (generator + pantry empty/load), workerd manual verification.

**Out of scope:** Try another (S-04), favorites (S-05), history UI (S-06), backend changes, i18n, `history_id` in URL, automated test suite setup.

## Architecture / Approach

```
dashboard.astro (SSR prefetch items, loadError)
       └── DashboardShell (client:load)
              ├── mobile: Tabs → PantryWidget | MealGenerator
              └── desktop: grid → PantryWidget | MealGenerator
MealGenerator → POST /api/generate → parseGenerateResponse
                     ├── success → Card + historyId state
                     ├── no_match → info panel
                     └── error → inline (429 vs other)
```

Pantry count flows from `PantryWidget.onItemsChange` so generate enables after the user adds items on the pantry tab without refresh.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Wire contract | Zod response schemas + parser | Schema drift from actual API JSON |
| 2. Shell + shadcn | Tabs, tokens, DashboardShell | Mobile/desktop layout regressions |
| 3. Pantry polish | loadError, Polish empty, count callback | Prefetch error hard to simulate locally |
| 4. Meal generator | Full north-star UX | LLM latency UX; workerd-only 429/KV |
| 5. Verification | build + preview sign-off | OpenRouter key missing in `.dev.vars` |

**Prerequisites:** F-01, F-02, S-02 (done). **Estimated effort:** ~2–3 focused sessions across 5 phases.

## Open Risks & Assumptions

- `prep_time_minutes` is prompt-enforced only; UI may show a recipe above selected preset — accepted for v1.
- All `no_match` causes share one reason; empty pantry and model refusal look the same in the generator panel.
- Rate limit testing may require workerd preview and repeated calls; KV may fail open in dev.
- `OPENROUTER_API_KEY` required for happy-path manual test.

## Success Criteria (Summary)

- User completes US-01 flow: constraints → **Generuj** → one recipe or clear **no_match**.
- Mobile tabs match `dashboard-layout.md`; desktop two-column unchanged.
- `pnpm run lint` and `pnpm run build` pass; manual workerd preview signed off.
