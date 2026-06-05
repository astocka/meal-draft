# Try Another Suggestion (S-04) — Plan Brief

> Full plan: `context/changes/try-another-suggestion/plan.md`

## What & Why

User rejects a generated meal and taps **Spróbuj inny** to get a different strict-pantry suggestion that excludes every recipe already shown in the session — with honest feedback as the pool shrinks and clear exhaustion messaging when no more options exist. This delivers roadmap **S-04** and PRD secondary success criterion: Try another reliably excludes past results.

## Starting Point

S-03 shipped `MealGenerator` with **Generuj** calling `POST /api/generate` using `exclude_names: []`. F-02 already accepts `exclude_names` (max 20) in the LLM user turn. No Try another button, session state, exhaustion copy, or pool indicator exists in `src/`.

## Desired End State

After a successful generation, user sees **Spróbuj inny** beside **Generuj**, a rejected-count indicator (**Odrzucono: N**), and can cycle through non-repeating suggestions until `no_match` — then an exhaustion panel (not the first-time failure copy) suggests relaxing meal type or time. **Generuj** starts a fresh session; changing constraints alone keeps exclusion history. Frontend-only; no API changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ------------------ | ------ |
| Scope | Frontend-only | F-02 forward-compat; `exclude_names` pipeline already shipped | Plan |
| Session reset | **Generuj** only | PRD "same session"; constraint tweaks keep rejection history | Plan |
| Pool indicator | Rejected count (Odrzucono: N) | Honest signal without fake "remaining" counts | Plan |
| Exhaustion UX | Distinct panel | First-time no_match copy misleads when session is exhausted | Plan |
| Loading UX | Keep card during Try another | Avoid layout jump; user retains context | Plan |
| Button placement | Beside Generuj | Matches `dashboard-layout.md` S-04+ | Plan |
| 20-cap handling | Disable Try another + recovery copy | Prevents Zod 400; points to Generuj reset | Plan |
| LLM duplicate name | Show anyway (v1) | Prompt-only exclusion; no backend dedup scope | Plan |
| Backend changes | None | Exhaustion inferred client-side from `no_match` + exclusions | Plan |

## Scope

**In scope:** `MealGenerator.tsx` session state, Try another button + loading, `exclude_names` wiring, exhaustion panel, rejected-count indicator, Polish copy in `generation-copy.ts`, lint/build/workerd manual verification.

**Out of scope:** Backend/API changes, `reason: exhausted`, server dedup, favorites (S-05), history UI (S-06), i18n, automated tests, true remaining-options count.

## Architecture / Approach

```
MealGenerator
  shownNames: string[]          ← session state (React)
  Generuj → exclude_names: []   ← resets shownNames
  Try another → exclude_names: [...shownNames, lastRecipe.name]
       ↓
  POST /api/generate (unchanged)
       ↓
  parseGenerateResponse
    ├── success → update card, stash historyId
    ├── no_match + exclusions → exhaustion panel
    └── no_match + no exclusions → S-03 first-time panel
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Session state & fetch | `shownNames`, shared handler, `exclude_names` wired | Append-timing bugs causing repeats or lost exclusions |
| 2. Try another UI | Button, keep-card loading, 20-cap guard | Mobile control bar crowding |
| 3. Exhaustion & indicator | Distinct panel, Odrzucono: N, copy module | Mis-classifying first-time vs exhaustion no_match |

**Prerequisites:** S-03 (done). **Estimated effort:** ~1–2 focused sessions across 3 phases.

## Open Risks & Assumptions

- LLM may rarely repeat an excluded name — accepted v1 risk; no client auto-retry.
- True meal pool size is unknown; rejected count is the PRD-compliant shrinking signal.
- Try another shares 10 req/user/hour rate limit with Generuj.
- `OPENROUTER_API_KEY` required for happy-path manual test on workerd preview.

## Success Criteria (Summary)

- US-06: Try another returns different suggestions; exhaustion message is clear and actionable.
- PRD AC: rejected-count visible; exhaustion suggests relaxing constraints.
- `pnpm run lint` and `pnpm run build` pass; manual workerd preview signed off.
