# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-02 (MVP change folders archived; phase 1 & 4 folders under `context/archive/`)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in `<area>`"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                       | Impact | Likelihood | Source (evidence — not anchor)                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------- |
| 1   | User A views or modifies User B's pantry, favorites, or generation history (RLS or policy gap)                | High   | Medium     | interview Q1; PRD Access Control; roadmap F-01                          |
| 2   | Generated meal lists ingredients outside the user's declared pantry (strict-pantry contract breach)           | High   | Medium     | PRD Guardrails §Success Criteria; roadmap north star S-03               |
| 3   | Rapid Try another clicks cause in-flight race: frozen UI, stale card swap, or card unmount during loading     | High   | Medium     | interview Q1, Q3; hot-spot dir `src/components` (47 commits/30d)        |
| 4   | API request/response contract drift — schema validates inner object not full envelope → quiet 400s for users  | Medium | High       | interview Q2; hot-spot dir `src/lib` (28 commits/30d)                   |
| 5   | Feature passes on Node (`astro dev`) but fails on Cloudflare workerd in production (500 or broken handler)    | High   | Medium     | interview Q1; tech-stack.md workerd constraint; AGENTS.md               |
| 6   | Authenticated user accesses another user's resource by ID (IDOR — session present but ownership not verified) | High   | Medium     | abuse lens; interview Q1; PRD Access Control                            |
| 7   | Rate-limit bypass via rapid generate/Try another requests → runaway OpenRouter token spend                    | High   | Medium     | interview Q1; PRD FR-010; try-another-suggestion plan (rate limit note) |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                    | Must challenge                                                                               | Context `/10x-research` must ground                                                                                      | Likely cheapest layer                                             | Anti-pattern to avoid                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| #1   | User B's pantry/favorites/history rows are invisible and unmodifiable when authenticated as User A                                                                                             | "RLS is enabled" implies cross-user denial works                                             | Supabase client paths, table policies, service-role vs user-role query patterns, migration policy completeness           | integration (local Supabase or policy SQL tests)                  | Testing only that authenticated users can CRUD their own data (happy-path-only)                               |
| #2   | A generation response with out-of-pantry ingredients is rejected or never returned to the client                                                                                               | LLM output is always trustworthy if the prompt says strict pantry                            | Server validation path, ingredient normalization rules, `no_match` vs success branching                                  | unit/integration with fixture LLM responses                       | Asserting against production validation logic copied into the test (oracle problem)                           |
| #3   | Only one in-flight generate request affects visible UI state; late responses do not overwrite newer results; loading does not unmount the recipe card                                          | Disabling the button alone prevents duplicate calls                                          | Client fetch handler, session exclusion state, loading flags, response ordering                                          | component test with mocked fetch + delayed responses              | Snapshot of full component tree without asserting ordering/in-flight behavior                                 |
| #4   | Malformed or partial API payloads return predictable 400 with stable error shape; valid envelopes pass                                                                                         | "We use Zod" means the full wire contract is covered                                         | Request/response schema locations, envelope vs nested validation, error translation to Polish copy boundaries            | unit (schema parse tests)                                         | Testing only the happy-path object the server already emits                                                   |
| #5   | Critical API routes and middleware behave correctly under workerd/Miniflare, not only Node dev                                                                                                 | Green `astro dev` manual test implies production safety                                      | Build/preview command, workerd-only APIs (KV rate limit), middleware redirect paths                                      | integration via wrangler/unstable_dev or documented workerd smoke | Running tests only under Node while claiming workerd coverage                                                 |
| #6   | Foreign resource ID never returns or mutates another user's row; PATCH → 404 without body leak; DELETE → row persists (verify DB state, not status alone — routes may return 204 on zero rows) | Middleware auth check implies per-resource ownership; DELETE 204 implies successful deletion | Route param handling, Supabase query filters, RLS as defense-in-depth vs explicit checks, PATCH vs DELETE HTTP semantics | integration (HTTP against local stack)                            | Mocking Supabase so ownership checks never execute; asserting DELETE status without verifying row persistence |
| #7   | Requests beyond the configured rate limit receive 429 and do not reach OpenRouter                                                                                                              | Rate limit exists in code so abuse is impossible                                             | Rate-limit storage (KV), counter key shape, window duration, generate + Try another sharing same limit                   | integration with mocked KV + mocked OpenRouter                    | Counting only successful responses while ignoring duplicate in-flight calls                                   |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                | Goal (one line)                                                                       | Risks covered         | Test types             | Status      | Change folder           |
| --- | ------------------------- | ------------------------------------------------------------------------------------- | --------------------- | ---------------------- | ----------- | ----------------------- |
| 1   | Data isolation            | Test runner bootstrap + per-user RLS on pantry, favorites, history; cross-user denial | #1, #6                | integration (Supabase) | implemented | data-isolation          |
| 2   | Bootstrap + API contracts | Zod wire/schema tests, protected-route auth gate                                      | #4, partial #6        | unit + integration     | not started | —                       |
| 3   | Generation server path    | Strict-pantry validation, rate limit, mocked OpenRouter edge                          | #2, #7, partial #5    | integration            | not started | —                       |
| 4   | Client session + CI gates | Try another race/loading behavior; workerd smoke; tests in CI                         | #3, #5, cross-cutting | Playwright E2E + CI    | implemented | client-session-ci-gates |

Implemented rollout phases 1 and 4 (`data-isolation`, `client-session-ci-gates`) are archived under `context/archive/` (2026-07-02). **Status `implemented`** means rollout completion, not active folder location.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

| Layer                | Tool                           | Version                   | Notes                                                                                                  |
| -------------------- | ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| unit + integration   | Vitest                         | ^4.1.8 (see package.json) | Bootstrapped in Phase 1 (data isolation); pair with `@vitest/coverage-v8` if coverage gate added later |
| API mocking          | MSW or vi.mock at HTTP edge    | none yet — see §3 Phase 2 | Mock OpenRouter and external HTTP only; never mock internal validation modules                         |
| component            | @testing-library/react + jsdom | none — not adopted        | Risk #3 covered by Playwright E2E on workerd preview (cheaper cross-boundary signal)                   |
| e2e                  | Playwright                     | ^1.60 (see package.json)  | Risk #3 + workerd preview; CI Tier 3 (`e2e` job)                                                       |
| accessibility        | none                           | —                         | Out of scope for v1 rollout                                                                            |
| (optional) AI-native | none                           | n/a                       | Not justified under cost × signal for current risks                                                    |

**Stack grounding tools (current session):**

- Docs: Context7 MCP — available; Vitest + Supabase test setup to verify during Phase 1 (data isolation) research; checked: 2026-06-06
- Search: Exa.ai MCP — available for tool discovery if Context7 lacks workerd-specific guidance; checked: 2026-06-06
- Runtime/browser: none — Playwright MCP not exposed in session; workerd verification via `pnpm run build && pnpm run preview`; checked: 2026-06-06
- Provider/platform: GitHub Actions CI — Tier 1 `ci` (lint + build + CI-safe Vitest), Tier 2 `integration` (full Vitest), Tier 3 `e2e` (Playwright on workerd preview); fork PRs run Tier 1 only; checked: 2026-06-08

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                               | Where                          | Required? | Catches                                               |
| ---------------------------------- | ------------------------------ | --------- | ----------------------------------------------------- |
| lint + build + Tier 1 Vitest       | local + CI (`ci` job)          | required  | syntactic / type drift; anon-key guard                |
| unit + integration (full Vitest)   | local + CI (`integration` job) | required  | logic regressions, RLS isolation, schema drift        |
| workerd smoke + E2E critical flows | local + CI (`e2e` job)         | required  | Node vs workerd mismatch; Risk #3 UI; `no_match` wire |
| post-edit hook                     | local (agent loop)             | planned   | not in scope for initial rollout                      |
| pre-prod smoke                     | between merge + prod           | optional  | environment-specific failures                         |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

TBD — see §3 Phase 2 for Zod schema / parse contract pattern (Risk #4).

### 6.2 Adding an integration test

Use this pattern for Supabase RLS / cross-user denial tests (Risk #1). Reference implementation: `tests/integration/rls-cross-user.test.ts`.

**Layout and naming**

- Place files under `tests/integration/` with suffix `*.test.ts`.
- Shared auth/env helpers live in `tests/helpers/` (see `supabase-test-client.ts`).

**Local setup**

1. Copy `.env.test.example` → `.env.test`.
2. Fill `SUPABASE_URL` and `SUPABASE_KEY` (anon key only — from `supabase status` or hosted Project Settings → API).
3. Set `TEST_USER_A_*` and `TEST_USER_B_*` credentials (dedicated test accounts; unique emails in your project).
4. Ensure your local database is running via: `npx supabase start` (before `pnpm test`).
5. Run: `pnpm test` (loads `.env.test` via Vitest config).

CI runs the full suite on same-repo PRs and pushes to `main` via the `integration` job when GitHub secrets are configured (see §6.6). Locally: `pnpm test` with `.env.test`.

**Two-user Auth API pattern**

- In `beforeAll`, provision User A and User B via `signUpOrSignIn()` from `tests/helpers/supabase-test-client.ts` (signUp with signIn fallback if already registered).
- Seed rows owned by User B using **User B's authenticated client** before cross-user assertions.
- Run denial assertions as **User A's client**: SELECT → empty `data`; INSERT with foreign `user_id` → error; UPDATE/DELETE foreign rows → no effect or error; confirm B's rows still exist via B's client.

**Oracle source**

Expected outcomes come from migration RLS policies and grants — not from copying app route handlers. See `supabase/migrations/` for policy definitions.

**Anti-patterns**

- Do **not** use the service-role key in test clients or assertions — anon key + user JWT only (the Env Guard implemented in `createClient()` will actively throw an error if a service-role token is detected to prevent false-positive green tests).
- Do **not** mock the Supabase client for RLS tests — use real auth sessions against a live project.
- Do **not** assert happy-path-only own-user CRUD without cross-user denial cases.

### 6.3 Adding a Risk #3 E2E test (Playwright)

Use Playwright on **workerd preview** for Try another in-flight / stale-response behavior (Risk #3). Reference implementations: `tests/e2e/seed.spec.ts`, `tests/e2e/try-another-stale-response.spec.ts`. Conventions: `tests/e2e/E2E-RULES.md`.

**Layout and naming**

- Place files under `tests/e2e/` with suffix `*.spec.ts`.
- One focused scenario per file when possible; provenance header links Risk #3.

**Local setup**

1. Copy `.env.test.example` → `.env.test` (test Supabase + User A/B).
2. For E2E, align **`.dev.vars`** `SUPABASE_URL` / `SUPABASE_KEY` with the **test** project (workerd preview reads `.dev.vars`; auth users must exist in that project). CI Tier 3 injects secrets as env vars — `playwright.config.ts` calls `scripts/ensure-dev-vars.mjs` to materialize `.dev.vars` when the file is absent.
3. Run: `pnpm test:e2e` (config starts `build && preview` on port 4321 — not `astro dev`). On Windows, prefer `pnpm test:e2e:isolation` for mutating specs; full suite parity is on CI Tier 3.

**Auth pattern**

- `tests/e2e/auth.setup.ts` signs in User A via API `request` (no browser); sends `Origin`/`Referer` headers (Astro rejects form POSTs without them). Saves `playwright/.auth/user.json`.
- `scripts/e2e-auth.mjs` — same auth outside Playwright workers (used by `pnpm test:e2e:isolation`).
- `playwright.config.ts`: `setup` project → `chromium` project with `storageState` and `dependencies: ["setup"]` (skipped when `PLAYWRIGHT_SKIP_SETUP=true`).
- Mutating specs: `page.goto("/dashboard")` — do not re-login in each test.

**Mocking `/api/generate`**

- `await page.route("**/api/generate", handler)` before navigation or clicks — handlers only intercept requests registered after the call.
- Use per-call delays in the handler to simulate in-flight overlap.
- Assert UI from the **rendered recipe card** (getByRole/getByText), not fetch implementation.
- In-flight Try another: assert the loading button (`Szukam innego…`), not the idle label (`Inny przepis`) — see `seed.spec.ts`.
- Out-of-order overlap: `try-another-stale-response.spec.ts` uses `page.evaluate` double-click plus `waitForResponse`; await **both** responses before DOM assertions — never `waitForTimeout` (see E2E-RULES). Passing in CI is a regression guard (no `test.fail()` wrapper).

**Mutating test data**

- Timestamp-unique pantry ingredient names (`*-e2e-${Date.now()}`); seed via UI or helpers; `try...finally` cleanup + `page.unrouteAll()` when mocking `/api/generate` (see `seed.spec.ts`, `no-match-info-panel.spec.ts`).
- Read-only smoke (Risk #5): `workerd-smoke.spec.ts` — empty `storageState`, no DB writes.

**Isolation re-run verification (local)**

- `pnpm test:e2e:isolation` — runs `seed.spec.ts`, `no-match-info-panel.spec.ts`, and `try-another-stale-response.spec.ts` twice each; confirms `POST /api/pantry` + `DELETE /api/pantry` per run. One build, reused preview (`PLAYWRIGHT_REUSE_SERVER=true`). CI still uses full `pnpm test:e2e`.

**Anti-patterns**

- Do **not** use jsdom/component tests for Risk #3 — DOM on workerd preview is the oracle.
- Do **not** put RLS cross-user assertions in E2E — use `tests/integration/` (§6.2).
- Do **not** trust `astro dev` for workerd-only behavior.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2 for protected-route + envelope validation pattern (Risks #4, #6).

### 6.5 Adding a test for generation logic

TBD — see §3 Phase 3 for strict-pantry validation with mocked LLM responses (Risk #2).

### 6.6 Per-rollout-phase notes

**Phase 1 (data isolation):** Tier A RLS cross-user suite (`pnpm test` + `.env.test`). Server `createClient()` rejects service-role `SUPABASE_KEY` via `assertSupabaseAnonKey()`. Tier B HTTP route tests deferred to Phase 2.

**Phase 4 (client session + CI gates):** Three-tier GitHub Actions (`.github/workflows/ci.yml`):

- **Tier 1 — `ci`:** lint, build, CI-safe Vitest (`assert-supabase-anon-key`, `placeholder`) — every PR including forks.
- **Tier 2 — `integration`:** full `pnpm test` (RLS suite) — same-repo PRs + push to `main` only; requires six repository secrets (see `.env.test.example`).
- **Tier 3 — `e2e`:** Playwright on workerd preview — same gating and secrets as Tier 2; `workers: 1` in CI. `ensure-dev-vars.mjs` writes `.dev.vars` from injected secrets so workerd preview can reach Supabase.

**Fork PRs:** Tier 1 only. Maintainers or contributors need a same-repo PR or local `pnpm test && pnpm test:e2e` for full signal.

**CI Supabase:** Use a dedicated hosted test project (not production). **Whenever a new DB migration is added under `supabase/migrations/`, manually apply it to the hosted CI Supabase project before merging to `main`.** Optional future: `supabase db push --linked` pre-test with `SUPABASE_ACCESS_TOKEN`.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Polish UI copy strings** — manual peer review is sufficient for v1; copy changes are low blast radius. Re-evaluate if copy drives business logic branching. (Source: Phase 2 interview Q5.)
- **shadcn/ui and third-party component boilerplate** — library-maintained; testing button render/click is textbook waste. Re-evaluate if wrapping components with custom auth or data logic. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-02
- Stack versions last verified: 2026-07-02
- AI-native tool references last verified: 2026-06-06

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
