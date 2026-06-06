# Data Isolation (Test Rollout Phase 1) — Plan Brief

> Full plan: `context/changes/data-isolation/plan.md`
> Research: `context/changes/data-isolation/research.md`

## What & Why

MealDraft stores pantry, favorites, and generation history per user behind Supabase RLS. The team's top fear is cross-user data leakage if policies or env misconfiguration fail. This change bootstraps Vitest and automates Tier A RLS cross-user tests — the cheapest signal for Risk #1 — plus a server guard that rejects service-role keys in app paths.

## Starting Point

F-01 shipped RLS policies and manual Studio verification; no test runner exists. App code uses anon-key SSR clients with defense-in-depth `user_id` filters. Research mapped all policies, API paths, and locked scope (Tier A only, local-only, no CI test job).

## Desired End State

A developer configures `.env.test` and runs `pnpm test` locally — User A cannot access User B's rows on all three tables. Misconfigured service-role `SUPABASE_KEY` fails fast in `createClient()`. The test-plan cookbook §6.2 documents how to add similar tests.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Exit criteria | Tier A RLS-only | Highest signal/cost for Risk #1 | Research |
| HTTP IDOR tests | Deferred to Phase 2 | Tier B in test-plan Phase 2 | Research |
| CI | Local-only | No Docker Supabase in GitHub Actions this phase | Research |
| Env guard | Yes, on first `createClient()` | Catches service-role misconfig before RLS bypass | Research + Plan |
| Test layout | `tests/integration/` | Separates integration from future unit tests | Plan |
| Test users | `beforeAll` signUp via Auth API | Real auth path; no service-role in tests | Plan |
| Risk #6 HTTP semantics | Assert DB state, not 403 | DELETE returns 204 on zero rows | Research |

## Scope

**In scope:** Vitest bootstrap; anon-key guard; RLS cross-user integration suite; `.env.test.example`; AGENTS.md + test-plan §6.2 cookbook.

**Out of scope:** CI test job; Tier B HTTP tests; RLS/migration changes; Playwright/component tests.

## Architecture / Approach

Vitest runs Node integration tests against local Supabase using `@supabase/supabase-js` with the **anon key** and two users created via Auth API. Tests seed User B's data with B's session, then assert User A's client cannot read or mutate B's rows. Application `createClient()` decodes JWT `role` and throws if service-role. No Astro runtime required for Tier A.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Vitest bootstrap | Runner, config, `pnpm test`, env template | Path alias mismatch with Astro |
| 2. Env guard + helpers | `assertSupabaseAnonKey`, test client factories | Guard throws when env optional in some contexts |
| 3. RLS suite | `tests/integration/rls-cross-user.test.ts` | Flaky auth if users already exist |
| 4. Cookbook + docs | test-plan §6.2, AGENTS.md | — |

**Prerequisites:** `.env.test` with Supabase URL + anon key (local dev project); F-01 migrations applied. Tests are local-only — not run in CI.

**Estimated effort:** ~1–2 sessions across 4 implement phases.

## Open Risks & Assumptions

- Tests require manual `pnpm test` with `.env.test` configured — local-only, no CI job.
- SignUp in `beforeAll` may need signIn fallback if test users persist between runs.
- Env guard JWT parsing assumes standard Supabase key format; exotic key formats need explicit handling.

## Success Criteria (Summary)

- `pnpm test` green locally with `.env.test` configured — cross-user denial on all three tables.
- Service-role key rejected in app `createClient()`.
- test-plan §6.2 documents the integration test pattern for future work.
