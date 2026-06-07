# E2E Testing Rules

- Use getByRole, getByLabel, getByText as primary locators.
  Fall back to getByTestId only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use page.waitForTimeout(). Wait for specific conditions:
  toBeVisible(), waitForURL(), waitForResponse(), toBeHidden().
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data
  to avoid collisions in parallel runs. Clean up created rows after the test.
- Authentication uses storageState from `tests/e2e/auth.setup.ts` (see playwright.config.ts).
  Do not log in through the UI in individual tests — call `page.goto("/dashboard")` instead.
- Always run Supabase/UI cleanup in `try...finally` or `test.afterEach` so failed
  assertions do not leave orphan test data.
- Risk #1 (RLS / cross-user data isolation) belongs in `tests/integration/`, not E2E.
  E2E targets UI-only or cross-boundary flows where the rendered DOM is the oracle
  (e.g. Risk #3 in-flight UI — see seed.spec.ts).
- Read-only smoke specs (e.g. `workerd-smoke.spec.ts`) must not mutate pantry or other
  user data — use empty `storageState` and assert routes/middleware only.
- Mutating specs must use timestamp-unique test data and `try...finally` cleanup so
  parallel or repeated runs do not collide (see seed.spec.ts pantry helpers).
- Risk #3 (Try another in-flight / stale response ordering) is covered by Playwright E2E,
  not Vitest integration or jsdom component tests — the oracle is the rendered recipe card
  on workerd preview (`seed.spec.ts`, `try-another-stale-response.spec.ts`).
