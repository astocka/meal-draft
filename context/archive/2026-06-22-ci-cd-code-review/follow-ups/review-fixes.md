# Impl-review triage follow-ups (2026-06-23)

## Phase 4 — not complete

Phase 4 closes only after 4.3 and 4.4 below. Until then, `change.md` stays `implementing`.

## After merge to `main`

- [ ] **4.3** Enable branch protection on `main`: require **AI Code Review / review**
- [ ] **4.4** Confirm Tier 1/2/3 CI green after `ci.yml` SHA pin
- [ ] Mark Phase 4 complete in `plan.md` Progress; set `change.md` status to `implemented`

## Code fixes applied during triage (uncommitted)

- [x] Verdict validation in composite action + comment step (F1)
- [x] Review job concurrency group (F2)
- [x] `PROJECT_RULES_GIT_REF` loads AGENTS.md from base branch in CI (F3)
- [x] Prompt envelope closing-tag escape (F4)
- [x] `requirements.md` rollout table synced (F7)

## Accepted / no code change

- [x] Same-repo PR trust model for `OPENROUTER_API_KEY` (F8)
- [x] 4.3 deferred until after merge (F5, F6)
