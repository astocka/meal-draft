# Client Session + CI Gates Implementation Plan

## Overview

Close **test-plan §3 Phase 4**: wire tiered GitHub Actions jobs for Vitest, Supabase RLS integration, and Playwright E2E on workerd preview; extend E2E for Risk #3 (Try another in-flight UI) and Risk #5 (workerd smoke); sync `test-plan.md` and `AGENTS.md`. **No production changes** to `MealGenerator` — stale-response handling remains a documented gap.

## Current State Analysis

- **Phase 1 (data-isolation)** is implemented: Vitest bootstrap, `tests/integration/rls-cross-user.test.ts`, `assertSupabaseAnonKey`, `.env.test.example`. Tests are **local-only**; CI runs lint + build only (`.github/workflows/ci.yml`).
- **Playwright** is installed ahead of test-plan §4: `playwright.config.ts` starts `build && preview` (workerd), auth via `storageState`, specs at `tests/e2e/seed.spec.ts` and `no-match-info-panel.spec.ts`.
- **Risk #3** UI guards exist in `MealGenerator.tsx` (`loadingSource`, `generationBlocked`, card kept during Try Another load) but **no stale-response discard** on generation responses (unlike `saveGenerationRef` for favorites).
- **Phases 2–3** (API contracts, generation server tests) are not started — soft dependencies; this change wires **existing** suites into CI and allows future tests to join the same jobs.

### Key Discoveries

- `seed.spec.ts` covers single Try Another in-flight UI but not out-of-order response completion (`tests/e2e/seed.spec.ts:65–100`).
- RLS suite skips cleanly when env vars missing (`tests/integration/rls-cross-user.test.ts:27–33`) — suitable for local dev without blocking lint.
- CI build already uses `SUPABASE_URL` / `SUPABASE_KEY` secrets; integration/E2E need all six `.env.test` vars plus User A for Playwright auth.
- **Fork PRs** cannot read repository secrets — integration and E2E jobs must be gated (see Phase 2/3).

## Desired End State

- **Tier 1 CI** (all PRs): lint + build + CI-safe Vitest (`assert-supabase-anon-key`, placeholder).
- **Tier 2 CI** (same-repo PRs + push to `main`, secrets present): full `pnpm test` including RLS cross-user suite against hosted CI Supabase project.
- **Tier 3 CI** (same gating): Playwright with chromium, workerd preview webServer, `auth.setup` + all E2E specs including thin workerd smoke and reversed-order race scenario.
- **Docs**: test-plan §3 Phase 4 → `implemented`; §4 Playwright row current; §6.3 documents Playwright-for-Risk-#3 pattern; §5 quality gates reflect CI enforcement; AGENTS.md documents CI tiers and fork behavior.
- **Verify locally**: `pnpm test`, `pnpm test:e2e` green (reversed-order uses `test.fail()` until production fix — see Open Risks).

## What We're NOT Doing

- Production fix for stale-response race in `MealGenerator` (follow-up change).
- `@testing-library/react` / jsdom component test stack (Playwright-only for Risk #3 per planning decision).
- Docker Supabase on GitHub runners (rejected in data-isolation research — cost/complexity).
- Automatic `supabase db push` on CI in this change (manual migration apply on hosted CI project — see Critical Implementation Details; automate in a follow-up if drift becomes painful).
- Test-plan Phases 2–3 suites (Zod wire, rate limit, strict-pantry integration).
- E2E on every page; post-edit hook; pre-prod smoke gate.
- Running integration/E2E on **fork PRs** without secrets (Tier 1 still required).

## Implementation Approach

Three-tier CI with explicit fork gating. E2E remains the Risk #3 layer (cheaper cross-boundary signal on workerd than adding jsdom). Reversed-order race uses `page.evaluate` to force two overlapping `/api/generate` responses (UI button lock prevents double-click path) with `test.fail()` until stale guard ships. Thin workerd smoke is **read-only** (no pantry mutations) to avoid flakes alongside mutating specs.

## Critical Implementation Details

### Fork PR gating

Use workflow condition:

```yaml
if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
```

on Tier 2 and Tier 3 jobs. Fork PRs run Tier 1 only; document in AGENTS.md that full test signal requires same-repo PR or local run.

### Reversed-order race + `test.fail()`

UI disables Try Another during load — out-of-order completion cannot be triggered by double UI click alone. The reversed-order spec fires two parallel fetches via `page.evaluate` while `/api/generate` is mocked with inverted delays (call 1: ~800ms → recipe A, call 2: ~100ms → recipe B).

**Wait for settle before asserting** — the test must prove that the slow response A completes _after_ B and still must not overwrite B. Do not use `page.waitForTimeout()` (E2E-RULES). Instead:

1. Start both requests (evaluate or UI + evaluate).
2. `await Promise.all([page.waitForResponse(.../api/generate), page.waitForResponse(...)])` — or equivalent — so both network responses have finished (including the 800ms slow one).
3. Only then assert: recipe B visible, recipe A not visible.

If assertions run before the slow response lands, a passing test would prove nothing about stale overwrite. Wrap in `test.fail()` with a comment linking to the follow-up production fix — CI stays green while documenting the gap. Remove `test.fail()` when stale guard lands.

### Hosted CI Supabase — migration drift

Tier 2/3 assume the hosted CI/test Supabase project schema matches `supabase/migrations/`. If a new migration lands in the repo but is not applied to the CI project, RLS/integration tests fail with opaque policy errors.

**This change (small diff):** document a mandatory manual step — no extra Supabase CLI secrets yet.

**Bold callout** in `AGENTS.md` and `.env.test.example`:

> **Whenever a new DB migration is added under `supabase/migrations/`, it must be manually applied to the hosted CI Supabase project before merging to `main`.**

**Future follow-up (optional):** pre-test step in Tier 2/3 — `pnpm exec supabase db push --linked` — requires `SUPABASE_ACCESS_TOKEN` + linked `SUPABASE_PROJECT_ID` (or equivalent) as additional GitHub secrets. Consider when migration drift causes repeated CI breakage.

### Test data isolation

- CI Playwright: keep `workers: 1` (already in config for CI).
- Mutating specs: timestamp-unique pantry ingredients + `try/finally` cleanup (existing seed pattern).
- Workerd smoke spec: no DB writes — signin page render + unauthenticated redirect to `/dashboard`.

---

## Phase 1: E2E Hardening

### Overview

Add workerd smoke and reversed-order Risk #3 scenario; audit E2E isolation patterns before CI wiring.

### Changes Required:

#### 1. Workerd smoke spec

**File**: `tests/e2e/workerd-smoke.spec.ts`

**Intent**: Fast-fail proof that critical routes render on workerd preview (Risk #5) without touching Supabase data.

**Contract**: New spec file, one test per file convention. Read-only flows: (1) `GET /auth/signin` — signin form visible; (2) unauthenticated visit to `/dashboard` — redirect to signin (middleware). No `storageState` dependency — run without auth project or in default chromium project with empty storage. Provenance header links Risk #5.

#### 2. Reversed-order race in seed

**File**: `tests/e2e/seed.spec.ts` (or sibling `try-another-stale-response.spec.ts` if seed should stay minimal)

**Intent**: Document Risk #3 out-of-order response gap — late slow response must not overwrite newer fast response.

**Contract**: New test `[Risk #3] out-of-order generate responses keep latest result` using mocked `/api/generate` with per-call delays (call 1: ~800ms → recipe A, call 2: ~100ms → recipe B). After first Generuj + Try Another establishes UI state, use `page.evaluate` to POST two parallel requests (or trigger overlap while route mock tracks in-flight count). **Before DOM assertions:** await both `/api/generate` responses via `page.waitForResponse` (e.g. `Promise.all`) so the slow response has completed — never `waitForTimeout`. Then assert recipe B visible and recipe A not visible (proves stale A did not overwrite B). Mark with `test.fail()` until `MealGenerator` gains generation request-id guard. Provenance header + step comments per E2E-RULES.

#### 3. E2E rules touch-up

**File**: `tests/e2e/E2E-RULES.md`

**Intent**: Record fork/isolation conventions and Risk #3 Playwright-as-canonical-layer decision.

**Contract**: Add bullets: read-only smoke specs avoid pantry mutations; mutating specs use unique data + cleanup; Risk #3 covered by Playwright not integration.

### Success Criteria:

#### Automated Verification:

- `pnpm exec playwright test tests/e2e/workerd-smoke.spec.ts` passes locally
- `pnpm exec playwright test tests/e2e/seed.spec.ts` passes (existing test)
- Reversed-order test runs and **fails** (expected under `test.fail()` — runner reports pass)
- `pnpm exec playwright test` — full suite green locally with `.env.test` + build secrets

#### Manual Verification:

- Confirm workerd smoke hits preview (not `astro dev`) via webServer log or port 4321
- Confirm reversed-order test failure message matches stale-overwrite behavior when `test.fail()` removed temporarily
- Confirm reversed-order test awaits both `waitForResponse` before assertions (slow mock ~800ms must complete first)
- Review mutating specs for unique-ingredient + cleanup pattern

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Vitest CI Jobs

### Overview

Add Tier 1 (always-on) and Tier 2 (secrets-gated) Vitest jobs to GitHub Actions.

### Changes Required:

#### 1. CI workflow — Tier 1

**File**: `.github/workflows/ci.yml`

**Intent**: Enforce CI-safe Vitest on every PR including forks.

**Contract**: After existing lint + build steps, add `pnpm exec vitest run src/lib/assert-supabase-anon-key.test.ts tests/integration/placeholder.test.ts` (or equivalent explicit paths). Job name remains `ci` or split into `lint-build` + `unit` — prefer extending existing job to minimize workflow churn. No Supabase secrets required.

#### 2. CI workflow — Tier 2 integration

**File**: `.github/workflows/ci.yml`

**Intent**: Run full `pnpm test` (including RLS suite) on same-repo PRs and main pushes when secrets available.

**Contract**: New job `integration` with fork gating condition. `needs: ci`. Env from secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`. Run `pnpm test`. Document required secrets in `.env.test.example` header comment and AGENTS.md.

#### 3. Env template CI notes

**File**: `.env.test.example`

**Intent**: Operators know which vars become GitHub secrets for Tier 2/3.

**Contract**: Comment block listing six vars + recommendation for dedicated hosted CI/test Supabase project (not production). **Bold migration callout:** whenever a new file is added under `supabase/migrations/`, manually apply it to the hosted CI project before merging to `main` (Tier 2/3 depend on schema parity).

### Success Criteria:

#### Automated Verification:

- Tier 1 passes on a branch with only CI-safe tests (no `.env.test` on runner)
- Tier 2 passes when all six secrets configured on same-repo PR
- `pnpm test` still passes locally with `.env.test`
- `pnpm run lint` passes

#### Manual Verification:

- Open a fork PR (or simulate) — confirm Tier 2 skipped, Tier 1 still runs
- Confirm RLS tests hit hosted CI project, not production (project URL review)
- Verify migration callout visible in `.env.test.example` and (after Phase 4) AGENTS.md
- Verify failed secret → clear job error message

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Playwright CI Job

### Overview

Add Tier 3 E2E job: browser install, workerd preview, full Playwright suite.

### Changes Required:

#### 1. CI workflow — Tier 3 E2E

**File**: `.github/workflows/ci.yml`

**Intent**: Run Playwright on workerd preview for Risk #3, #5, and no_match UI contract in CI.

**Contract**: New job `e2e` with same fork gating as Tier 2. `needs: ci`. Steps: `pnpm exec playwright install --with-deps chromium`, env vars (build secrets + all six test vars), `pnpm exec playwright test`. Reuse existing `playwright.config.ts` webServer (build + preview). `CI=true` enables retries/workers=1.

#### 2. Playwright config CI hardening (if needed)

**File**: `playwright.config.ts`

**Intent**: Ensure CI uses single worker and sufficient webServer timeout.

**Contract**: Verify `workers: process.env.CI ? 1 : undefined` and `timeout: 180_000` on webServer — adjust only if CI flakes; no functional change unless observed.

#### 3. package.json script (optional)

**File**: `package.json`

**Intent**: Document CI invocation parity.

**Contract**: Optionally add `"test:ci": "vitest run && playwright test"` — only if it simplifies docs; not required if workflow calls commands directly.

### Success Criteria:

#### Automated Verification:

- Tier 3 job green on same-repo PR with secrets + chromium install
- All specs run: `auth.setup.ts`, `workerd-smoke.spec.ts`, `seed.spec.ts`, `no-match-info-panel.spec.ts`
- `pnpm test:e2e` passes locally

#### Manual Verification:

- Confirm E2E job uses preview/workerd (not Node dev)
- Confirm auth.setup runs once per job before dependent specs
- Review CI duration — acceptable for PR gate (~5–10 min expected)

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Docs & Test-Plan Sync

### Overview

Update test-plan, AGENTS.md, change.md, and CI contributor docs so agents and humans see accurate gates.

### Changes Required:

#### 1. Test plan rollout table + stack

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 4 implemented; reflect Playwright-for-Risk-#3 and CI enforcement.

**Contract**: §3 Phase 4 row → Status `implemented`, Change folder `client-session-ci-gates`. §4 e2e row → Playwright ^1.60, notes "Risk #3 + workerd preview; CI Tier 3". §5 gates → unit+integration and workerd smoke "required" with CI job names. §6.3 replace TBD with Playwright pattern (reference `seed.spec.ts`, mock generate, auth storageState, unique pantry data). §6.6 append Phase 4 note (CI tiers, fork gating, secrets list).

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Intent**: Agents know CI runs tests and fork limitations.

**Contract**: Commands section — `pnpm test:e2e`; CI section — three tiers, fork PR behavior, required GitHub secrets; remove "CI does not run tests yet". **Bold migration callout** (same wording as `.env.test.example`): new `supabase/migrations/` files must be manually applied to the hosted CI Supabase project before merge to `main`. Note optional future: `supabase db push --linked` pre-test step with `SUPABASE_ACCESS_TOKEN` — out of scope for this change.

#### 3. change.md enrichment

**File**: `context/changes/client-session-ci-gates/change.md`

**Intent**: Per lessons.md — Outcome, Prerequisites, PRD refs for traceability.

**Contract**: `status: planned` → `implementing` when execution starts (plan write sets `planned`). Add `### Outcome`, `### Prerequisites`, `### PRD refs` under Notes (test-plan Phase 4 cross-cutting quality gates; prerequisites: data-isolation implemented, hosted CI Supabase + GitHub secrets; PRD refs: NFR quality, interview Q1/Q3 concerns).

#### 4. README CI secrets (if README documents env)

**File**: `README.md` (only if existing CI/env section — minimal addition)

**Intent**: Human operators can configure GitHub secrets.

**Contract**: Short subsection or link to `.env.test.example` for CI secret setup — skip if redundant with AGENTS.md.

### Success Criteria:

#### Automated Verification:

- `pnpm run lint` passes after doc edits
- No broken internal links in edited markdown

#### Manual Verification:

- Read test-plan §6.3 — a new contributor can add Risk #3 E2E following the pattern
- AGENTS.md accurately describes what runs on fork vs same-repo PR

**Implementation Note**: Final phase — epilogue commit updates `change.md` to `implemented`.

---

## Testing Strategy

### Unit Tests (Vitest)

- Tier 1: `assert-supabase-anon-key.test.ts`, `placeholder.test.ts` — no external deps.
- Tier 2: full suite including `rls-cross-user.test.ts`.

### E2E (Playwright on workerd preview)

- **Risk #3**: `seed.spec.ts` — in-flight UI + reversed-order (`test.fail()` until fix); reversed-order waits for both `waitForResponse` before asserting DOM.
- **Risk #5**: `workerd-smoke.spec.ts` — route/middleware on preview.
- **Client wire**: `no-match-info-panel.spec.ts` — HTTP 200 `no_match` → info panel.

### Manual Testing Steps

1. Run full local suite: `pnpm test && pnpm test:e2e`.
2. Temporarily remove `test.fail()` on reversed-order test — confirm red, revert.
3. Push same-repo PR — all three CI tiers green with secrets.
4. Simulate fork PR — Tier 1 only.

## Performance Considerations

- E2E job runs `build && preview` per job — ~3–5 min build amortized; acceptable for PR gate.
- `workers: 1` in CI prevents parallel pantry mutation flakes.
- Do not add `playwright install` to Tier 1 — keep browser deps isolated to Tier 3.

## Migration Notes

- **GitHub secrets**: Add six test vars to repo settings before enabling Tier 2/3 on main. Use a dedicated Supabase project (migrations applied, test users A/B created).
- **CI schema parity (manual, this change):** After adding any migration under `supabase/migrations/`, apply it to the hosted CI Supabase project before merging to `main`. Documented in AGENTS.md and `.env.test.example`. Forgetting this causes Tier 2/3 to fail without an obvious "migration missing" message.
- **CI schema parity (automated, future):** Optional pre-test step `pnpm exec supabase db push --linked` in Tier 2/3 — needs `SUPABASE_ACCESS_TOKEN` + linked project; not in this change.
- **Existing contributors**: Local workflow unchanged; CI adds enforcement on same-repo PRs.
- **Fork contributors**: Tier 1 still blocks broken lint/build/unit; full signal requires maintainer rerun or local `pnpm test && pnpm test:e2e`.

## References

- Test plan: `context/foundation/test-plan.md` §3 Phase 4, Risks #3/#5
- Phase 1 precedent: `context/changes/data-isolation/plan.md`, `research.md` Decision #3
- E2E exemplar: `tests/e2e/seed.spec.ts`
- Client session: `src/components/meal/MealGenerator.tsx`
- CI today: `.github/workflows/ci.yml`

## Open Risks & Assumptions

- **Reversed-order `test.fail()`**: CI stays green while gap is documented; removing wrapper without production fix breaks Tier 3.
- **Hosted CI Supabase**: Team maintains test users on CI project — not production. **Migration drift:** new repo migrations must be manually applied to CI project (documented in AGENTS.md / `.env.test.example`); automate via `supabase db push` in a follow-up if needed.
- **Reversed-order timing**: Assertions after both `waitForResponse` calls — if the slow mock response is not awaited, the test cannot prove stale overwrite behavior.
- **Fork PRs**: No integration/E2E in CI by design — accepted tradeoff vs Docker Supabase on runner.
- **Phases 2–3**: Future test files auto-join Tier 2 when added under `tests/`; no plan change required.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: E2E Hardening

#### Automated

- [x] 1.1 `pnpm exec playwright test tests/e2e/workerd-smoke.spec.ts` passes locally
- [x] 1.2 `pnpm exec playwright test tests/e2e/seed.spec.ts` passes (existing test)
- [x] 1.3 Reversed-order test runs under `test.fail()` — runner reports pass
- [ ] 1.4 `pnpm exec playwright test` — full suite green locally

#### Manual

- [x] 1.5 Workerd smoke confirmed on preview; reversed-order failure verified with `test.fail()` removed temporarily; isolation patterns reviewed

### Phase 2: Vitest CI Jobs

#### Automated

- [ ] 2.1 Tier 1 CI-safe Vitest passes without Supabase secrets on runner
- [ ] 2.2 Tier 2 integration job passes with all six secrets on same-repo PR
- [ ] 2.3 `pnpm test` passes locally with `.env.test`
- [ ] 2.4 `pnpm run lint` passes

#### Manual

- [ ] 2.5 Fork PR skips Tier 2; RLS hits CI project not production; missing secret errors are clear

### Phase 3: Playwright CI Job

#### Automated

- [ ] 3.1 Tier 3 E2E job green on same-repo PR with secrets
- [ ] 3.2 All E2E specs run in CI (auth.setup, workerd-smoke, seed, no-match-info-panel)
- [ ] 3.3 `pnpm test:e2e` passes locally

#### Manual

- [ ] 3.4 E2E uses workerd preview; auth.setup ordering verified; CI duration acceptable

### Phase 4: Docs & Test-Plan Sync

#### Automated

- [ ] 4.1 `pnpm run lint` passes after doc edits
- [ ] 4.2 No broken internal links in edited markdown

#### Manual

- [ ] 4.3 test-plan §6.3 and AGENTS.md fork/CI docs reviewed by human
