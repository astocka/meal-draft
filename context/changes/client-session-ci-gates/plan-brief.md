# Client Session + CI Gates — Plan Brief

> Full plan: `context/changes/client-session-ci-gates/plan.md`
> Research: `context/changes/data-isolation/research.md` (CI deferred to Phase 4)
>
> **Shipped 2026-06-10:** three-tier CI green; `test.fail()` removed from stale-response spec; CI E2E uses `ensure-dev-vars.mjs`.

## What & Why

Close test-plan **Phase 4**: protect Risk #3 (Try another in-flight UI) and Risk #5 (workerd runtime) with Playwright on preview, and wire **tiered CI gates** so Vitest, RLS integration, and E2E run on same-repo PRs. The product already has local tests and Playwright specs; CI still runs lint + build only — this change enforces the quality gates the test plan promised after Phase 1.

## Starting Point

- **Phase 1 done**: Vitest, RLS cross-user suite, anon-key guard, `.env.test` pattern — local-only per data-isolation research.
- **Playwright ahead of plan**: `seed.spec.ts`, `no-match-info-panel.spec.ts`, workerd webServer in config.
- **Gaps**: no CI test jobs, no workerd smoke spec, no reversed-order race test, test-plan §6.3 TBD, fork PR secret exposure unresolved.

## Desired End State

Same-repo PRs and main get three CI tiers: (1) lint + build + CI-safe Vitest always; (2) full Vitest + RLS with hosted Supabase secrets; (3) Playwright E2E on workerd preview. Fork PRs get Tier 1 only. Docs tell contributors how to run locally and configure secrets. Reversed-order race test documents MealGenerator stale-response gap via `test.fail()` until a follow-up fix.

## Key Decisions Made

| Decision             | Choice                                             | Why                                                    | Source          |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------ | --------------- |
| Production scope     | Tests + CI only                                    | Smallest diff; race fix is separate change             | Plan            |
| Risk #3 layer        | Playwright E2E (not component/jsdom)               | Already installed; workerd cross-boundary signal       | Plan            |
| CI structure         | Tiered jobs in one PR                              | Green baseline fast; secrets jobs gated                | Plan            |
| Supabase in CI       | Hosted project + GitHub secrets                    | data-isolation rejected Docker on runner               | Plan + Research |
| Fork PRs             | Tier 2/3 skipped                                   | Secrets unavailable on fork workflows                  | Plan            |
| Reversed-order test  | `test.fail()` until fix                            | Documents gap without red CI                           | Plan            |
| Workerd smoke        | Read-only Playwright spec                          | Risk #5 fast-fail; no DB mutation flakes               | Plan            |
| Docs                 | Full test-plan + AGENTS sync                       | Single source of truth                                 | Plan            |
| CI migration sync    | Manual apply to hosted CI project                  | Small diff; avoids extra Supabase CLI secrets now      | Plan            |
| Reversed-order waits | `waitForResponse` for both mocks before DOM assert | Proves slow response A cannot overwrite B after settle | Plan            |

## Scope

**In scope:** E2E hardening (smoke + reversed-order), tiered CI workflow, secrets documentation, test-plan §3/4/5/6.3/6.6 + AGENTS.md updates, change.md Outcome/Prerequisites.

**Out of scope:** MealGenerator stale-response fix; Phases 2–3 test suites; component test stack; Docker Supabase on CI; automatic `supabase db push` on CI (manual migration apply documented instead); E2E on every page.

## Architecture / Approach

```
PR push ─┬─ Tier 1 (always): lint → build → CI-safe Vitest
         ├─ Tier 2 (same-repo + secrets): pnpm test (RLS integration)
         └─ Tier 3 (same-repo + secrets): playwright install → test (preview/workerd)
```

Playwright mocks `/api/generate` for deterministic Risk #3/#UI tests; RLS uses real Supabase sessions. Mutating E2E uses timestamp-unique pantry data + cleanup; smoke spec is read-only.

## Phases at a Glance

| Phase            | What it delivers                                             | Key risk                                                       |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1. E2E hardening | workerd smoke + reversed-order `test.fail()`                 | must await both responses before assert — not `waitForTimeout` |
| 2. Vitest CI     | Tier 1 + Tier 2 jobs, fork gating, migration callout in docs | CI project schema drift if migration not applied               |
| 3. Playwright CI | Tier 3 job, chromium install                                 | CI duration; preview build flakiness                           |
| 4. Docs sync     | test-plan, AGENTS.md, change.md                              | Doc drift if §6.3 incomplete                                   |

**Prerequisites:** data-isolation implemented; hosted CI Supabase project with migrations + test users A/B; GitHub secrets for six `.env.test` vars (+ existing build secrets).

**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- Reversed-order protection requires follow-up production change; `test.fail()` is intentional.
- Fork contributors do not get full CI signal without maintainer/local run.
- CI Supabase project must stay isolated from production data.
- **Migration drift:** new `supabase/migrations/` must be manually applied to CI project before merge — documented in AGENTS.md / `.env.test.example`; automate later with `supabase db push --linked` if needed.
- Reversed-order test must use `waitForResponse` (both mocks) before DOM assertions, or it cannot prove stale overwrite.

## Success Criteria (Summary)

- Same-repo PR: lint, build, Vitest (full), and Playwright E2E all green in CI.
- Fork PR: lint, build, CI-safe Vitest green; integration/E2E skipped gracefully.
- test-plan Phase 4 marked implemented; AGENTS.md describes CI tiers and local commands.
