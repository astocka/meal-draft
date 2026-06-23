# CI/CD Code Review — Implementation Plan

## Overview

Wire the existing `packages/code-reviewer` agent into GitHub Actions so every same-repo PR to `main` receives an automated AI review: diff in, structured JSON out, PR comment posted, job fails on `verdict: fail`. Phase 1 MVP workflow and composite action are already committed on `feat/ci-cd-code-review`; this plan completes verification, then adds labels/on-demand retry, PR title context, and documentation including branch protection and SHA-pinning standards.

## Current State Analysis

### Key Discoveries:

- **Workflow exists** — `.github/workflows/review.yml` triggers on PRs to `main` + `workflow_dispatch`, SHA-pins remote actions, gates fork PRs (`.github/workflows/review.yml:3-17`)
- **`fetch-depth: 0` already set** — checkout step uses full history (`.github/workflows/review.yml:19-21`); required for `git diff base.sha...head.sha` to produce a non-empty diff on the runner
- **Composite action** — `.github/actions/ai-reviewer/action.yml` pipes diff to `pnpm --filter code-reviewer review`, exposes `verdict` + `review-json` outputs, does not exit 1 on fail verdict (comment posts first)
- **Agent rubric** — five stack-specific criteria in `packages/code-reviewer/src/schemas/review.ts`; eval-validated; mapped to generic rubric in `requirements.md` § Implementation rubric (MVP)
- **Secret required** — `OPENROUTER_API_KEY` must be added in GitHub repo settings before first run
- **Labels not created** — `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` must be created manually in GitHub UI (user decision)
- **`ci.yml` uses floating `@v4` tags** — `review.yml` already SHA-pins; `ci.yml` should be aligned in Phase 4 per Zero Trust / 2026 security standard

## Desired End State

After all phases:

1. Opening or updating a same-repo PR to `main` runs **AI Code Review** automatically
2. PR receives an upserted comment with five criterion scores + summary
3. PR gets `ai-cr:passed` or `ai-cr:failed` label after each run
4. Adding `ai-cr:review` label triggers a re-run (on-demand retry)
5. Agent receives git diff + PR title (not description)
6. Fail verdict fails the job; after first successful soak run, **AI Code Review / review** becomes a required branch protection check
7. `AGENTS.md` documents the AI review CI tier, secrets, labels, and SHA-pinning policy
8. `ci.yml` third-party actions pinned to commit SHAs (same standard as `review.yml`)

### Verification

- Open a test PR → workflow runs → comment appears with scores → pass/fail label applied
- Add `ai-cr:review` → workflow re-runs → comment updated
- Introduce a known violation in diff → job fails, `ai-cr:failed` label applied
- Branch protection lists **AI Code Review / review** as required check (after soak)

## What We're NOT Doing

- PR description input (deferred — token cost)
- Migrating agent to six generic criteria (keep five stack-specific; see `requirements.md`)
- Scored complexity / documentation fields (follow-up change with new eval fixtures)
- Eval CI tier (promptfoo in CI — separate change per `code-review-evals`)
- Fork PR AI reviews (forks skipped — secrets unavailable)
- Publishing composite action to external repo (`org/ai-reviewer@sha` — local `./.github/actions/ai-reviewer` is correct for this repo)
- Business alignment / architectural fit criteria (parked in requirements)

## Implementation Approach

Four sequential phases matching `requirements.md` § Rollout phases. Phase 1 is mostly verification + merge; Phases 2–3 extend workflow/composite action/agent; Phase 4 is docs + `ci.yml` SHA alignment. Remote actions stay SHA-pinned; local composite action runs from checked-out ref (no external tag to hijack).

## Critical Implementation Details

**Shallow checkout breaks the agent.** The default `actions/checkout` fetch depth is 1. Without `fetch-depth: 0`, `git diff base.sha...head.sha` often returns empty and the agent skips or errors. This is already configured in `review.yml` — do not remove it. Any new workflow that runs the reviewer must preserve full history checkout.

**Fail verdict vs job failure ordering.** The composite action must not `exit 1` on `verdict: fail` before outputs are written — the workflow posts the PR comment first, then the **Enforce verdict** step exits 1. Changing this order breaks fail-path comments.

**SHA-pinning (2026 Zero Trust standard).** Pin every **remote** action to a full commit SHA (`owner/repo@<40-char-sha> # vX` comment for maintainability). Floating tags (`@v4`) can be retargeted without your knowledge; actions run with access to secrets. `review.yml` already complies. Phase 4 aligns `ci.yml`. Local composite actions (`./.github/actions/ai-reviewer`) run your own code at the PR commit — no remote SHA needed.

**Label permissions.** Applying labels via `github.rest.issues.addLabels` requires `issues: write` in addition to `pull-requests: write`. Extend workflow `permissions` in Phase 2.

---

## Phase 1: Ship MVP

### Overview

Merge the existing workflow, configure the OpenRouter secret, verify end-to-end on a live PR, and document manual label creation steps (labels used in Phase 2).

### Changes Required:

#### 1. GitHub repository secret

**File**: GitHub → Settings → Secrets and variables → Actions

**Intent**: Provide OpenRouter API key to the composite action at runtime.

**Contract**: Secret name `OPENROUTER_API_KEY` — same value as local `packages/code-reviewer/src/.env`.

#### 2. Manual label provisioning (document only — no code)

**File**: GitHub → Issues → Labels (or document in plan verification / README note)

**Intent**: Pre-create labels before Phase 2 code applies them.

**Contract**: Create three labels:

| Label          | Color (suggested) | Purpose                 |
| -------------- | ----------------- | ----------------------- |
| `ai-cr:passed` | green (`0e8a16`)  | Last review passed      |
| `ai-cr:failed` | red (`d73a4a`)    | Last review failed      |
| `ai-cr:review` | blue (`0366d6`)   | On-demand retry trigger |

#### 3. Merge and verify workflow

**File**: `.github/workflows/review.yml`, `.github/actions/ai-reviewer/action.yml`

**Intent**: Confirm committed workflow works on a real PR after secret is set.

**Contract**: No code changes expected unless verification reveals bugs. Preserve `fetch-depth: 0` on checkout.

#### 4. Document label setup in change folder

**File**: `context/changes/ci-cd-code-review/requirements.md` or verification notes

**Intent**: Record that labels are manually created, not workflow-provisioned.

**Contract**: Add short "Label setup" note under Expected behavior if not already present.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid (no syntax errors on push)
- `pnpm --filter code-reviewer typecheck` passes (agent package unchanged)

#### Manual Verification:

- `OPENROUTER_API_KEY` secret exists in GitHub repo settings
- `feat/ci-cd-code-review` merged to `main` (or test PR from feature branch)
- Test PR triggers **AI Code Review** workflow
- PR comment appears with five criterion scores and summary
- Job passes on clean PR; job fails when diff contains a known hard-fail (e.g. `"use client"`)
- Checkout uses `fetch-depth: 0` — confirm diff is non-empty in workflow logs
- Three `ai-cr:*` labels created in GitHub UI

**Implementation Note**: Pause after manual verification succeeds before Phase 2. Do not enable branch protection required check yet (advisory soak period).

---

## Phase 2: Labels and On-Demand Retry

### Overview

Apply pass/fail labels after each review; allow re-run when `ai-cr:review` label is added.

### Changes Required:

#### 1. Extend workflow triggers

**File**: `.github/workflows/review.yml`

**Intent**: Re-run review when user adds retry label; keep automatic runs on open/sync/reopen.

**Contract**: Extend `pull_request` trigger:

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, labeled]
  workflow_dispatch:
```

Add job-level or step-level condition: when `github.event.action == 'labeled'`, run only if `github.event.label.name == 'ai-cr:review'`. For other PR events, run as today.

#### 2. Extend permissions

**File**: `.github/workflows/review.yml`

**Intent**: Allow label add/remove on PRs.

**Contract**: Add `issues: write` to job `permissions` block (alongside existing `contents: read`, `pull-requests: write`).

#### 3. Apply pass/fail labels after review

**File**: `.github/workflows/review.yml`

**Intent**: Satisfy `requirements.md` Expected side-effects — visual pass/fail on PR.

**Contract**: New step after **Post review comment**, before **Enforce verdict**:

- Skip when `verdict == skip`
- Remove existing `ai-cr:passed` and `ai-cr:failed` from PR (idempotent)
- Add `ai-cr:passed` if verdict is `pass`, else `ai-cr:failed`
- Use `actions/github-script` (same SHA pin as comment step) with `github.rest.issues.addLabels` / `removeLabel`

On `labeled` retry runs: remove `ai-cr:review` label after successful run start (optional UX — prevents duplicate triggers on re-sync).

#### 4. Skip automatic label application on retry-only cosmetic events

**File**: `.github/workflows/review.yml`

**Intent**: Avoid infinite loops if label application re-triggers workflow.

**Contract**: `labeled` trigger fires only for `ai-cr:review`, not for `ai-cr:passed`/`ai-cr:failed` applied by the workflow itself (GitHub does not re-fire `labeled` for bot-applied labels on same actor in most cases — verify in manual test; add `if` guard if loop observed).

### Success Criteria:

#### Automated Verification:

- Workflow YAML valid after trigger/permission changes

#### Manual Verification:

- Automatic PR run applies correct pass/fail label
- Adding `ai-cr:review` triggers new run; comment and label update
- No workflow loop from label application
- Fail path still posts comment before job fails

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: PR Title Input

### Overview

Pass PR title to the agent for intent-checking without the token cost of full description.

### Changes Required:

#### 1. Composite action — accept title input

**File**: `.github/actions/ai-reviewer/action.yml`

**Intent**: Thread PR title from workflow into agent environment.

**Contract**: Add optional input `pr-title` (default empty). Set env `PR_TITLE: ${{ inputs.pr-title }}` on agent step.

#### 2. Workflow — pass title on pull_request events

**File**: `.github/workflows/review.yml`

**Intent**: Supply title when available.

**Contract**: Add to composite action `with`:

```yaml
pr-title: ${{ github.event.pull_request.title || '' }}
```

#### 3. Agent prompt — include title in user message

**File**: `packages/code-reviewer/src/prompts/review.ts`

**Intent**: Give model PR intent context alongside diff.

**Contract**: Extend `buildReviewPrompt(diff, options?: { title?: string })` to wrap title in `<pr_title>` tags with same injection guard language as diff. Omit section when title empty.

#### 4. Thread title through agent API

**Files**: `packages/code-reviewer/src/agents/reviewer.ts`, `packages/code-reviewer/src/cli.ts`

**Intent**: CLI and `reviewDiff()` accept optional title (env `PR_TITLE` or param).

**Contract**: `reviewDiff(diff, projectRules?, model?, title?)` — backwards compatible. CLI reads `process.env.PR_TITLE` when set.

#### 5. Eval smoke check

**File**: `packages/code-reviewer/evals/` (no new fixture required)

**Intent**: Ensure prompt change does not break existing eval assertions.

**Contract**: Run `pnpm --filter code-reviewer eval` locally if prompt text changes materially.

### Success Criteria:

#### Automated Verification:

- `pnpm --filter code-reviewer typecheck` passes
- `pnpm run lint` passes for touched files

#### Manual Verification:

- Test PR with descriptive title — summary references intent where relevant
- `workflow_dispatch` run still works (empty title)
- Local: `PR_TITLE="feat: add X" git diff main...HEAD | pnpm --filter code-reviewer review` runs without error

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Documentation and SHA-Pinning Alignment

### Overview

Document AI review CI tier in `AGENTS.md`, branch protection setup (advisory soak → required check), and pin `ci.yml` remote actions to commit SHAs.

### Changes Required:

#### 1. AGENTS.md — AI Code Review CI tier

**File**: `AGENTS.md`

**Intent**: Agents and contributors know how PR review automation works.

**Contract**: Add subsection under **CI (GitHub Actions)**:

- Workflow name: **AI Code Review**; job: `review`
- Trigger: same-repo PRs to `main`; fork PRs skipped
- Secret: `OPENROUTER_API_KEY`
- Labels: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` (manual setup)
- Required check name after soak: **AI Code Review / review**
- Local equivalent: `git diff main...HEAD | pnpm --filter code-reviewer review`
- SHA-pinning policy: all remote actions pinned to commit SHA

#### 2. Branch protection documentation

**File**: `AGENTS.md` or `context/changes/ci-cd-code-review/requirements.md`

**Intent**: Record merge gate rollout (advisory first, required after first successful run).

**Contract**: Steps: merge workflow → verify test PR → Settings → Branches → `main` → require **AI Code Review / review**.

#### 3. Pin ci.yml remote actions to SHAs

**File**: `.github/workflows/ci.yml`

**Intent**: Align with Zero Trust standard used in `review.yml`.

**Contract**: Replace `@v4` on `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` with full commit SHAs matching versions in `review.yml` (or resolve current SHAs at implementation time). Add `# v4` comment on each line.

#### 4. Update change.md outcome

**File**: `context/changes/ci-cd-code-review/change.md`

**Intent**: Per lessons.md — record Outcome, Prerequisites, PRD refs.

**Contract**: Add `### Outcome`, `### Prerequisites` (`OPENROUTER_API_KEY` secret, manual labels), `### PRD refs` if applicable.

### Success Criteria:

#### Automated Verification:

- `pnpm run lint` passes (AGENTS.md markdown if linted)
- `ci.yml` and `review.yml` use SHA-pinned remote actions only

#### Manual Verification:

- AGENTS.md section is accurate against live workflow
- Branch protection enabled with **AI Code Review / review** after soak
- Tier 1/2/3 CI still passes after `ci.yml` SHA pin change

---

## Testing Strategy

### Unit Tests:

- No new Vitest tests required — agent behavior covered by existing promptfoo evals; run evals after Phase 3 prompt change

### Integration Tests:

- None in repo for GHA — manual PR verification is the integration test

### Manual Testing Steps:

1. Set `OPENROUTER_API_KEY` secret
2. Create labels in GitHub UI
3. Open test PR → verify comment, label, job status
4. Push fix → verify comment upsert (same marker)
5. Add `ai-cr:review` → verify re-run
6. Merge to `main` → enable branch protection after successful run
7. Confirm fork PR does not run AI review job

## Performance Considerations

- Full `fetch-depth: 0` checkout increases clone time vs shallow — acceptable for correct diffs
- Large PR diffs increase OpenRouter token cost — no truncation in MVP; monitor and add cap in follow-up if needed
- Default model `anthropic/claude-haiku-4.5` — eval-selected for speed/cost

## Migration Notes

- No database or runtime migration
- One-time manual: GitHub secret + three labels + branch protection (after soak)
- Existing PRs: first sync after merge triggers review

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Research: `context/changes/ci-cd-code-review/research.md`
- Agent schema: `packages/code-reviewer/src/schemas/review.ts`
- Workflow: `.github/workflows/review.yml`
- Composite action: `.github/actions/ai-reviewer/action.yml`
- Prior deferral: `context/changes/tool-loop-agent/plan.md:69`
- Eval default model: `context/changes/code-review-evals/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Ship MVP

#### Automated

- [x] 1.1 `pnpm --filter code-reviewer typecheck` passes — d1d8c87

#### Manual

- [x] 1.2 `OPENROUTER_API_KEY` secret configured in GitHub — d1d8c87
- [x] 1.3 `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` labels created in GitHub UI — d1d8c87
- [x] 1.4 Feature branch merged; test PR triggers workflow — d1d8c87
- [x] 1.5 PR comment with five scores appears; pass and fail paths verified — d1d8c87
- [x] 1.6 Workflow logs confirm non-empty diff (`fetch-depth: 0` preserved) — d1d8c87

### Phase 2: Labels and On-Demand Retry

#### Automated

- [x] 2.1 Workflow YAML valid after trigger and permission changes — d884926

#### Manual

- [x] 2.2 Automatic run applies `ai-cr:passed` or `ai-cr:failed` — d884926
- [x] 2.3 Adding `ai-cr:review` triggers re-run; comment and label update — d884926
- [x] 2.4 No label-application workflow loop — d884926

### Phase 3: PR Title Input

#### Automated

- [x] 3.1 `pnpm --filter code-reviewer typecheck` passes
- [x] 3.2 `pnpm run lint` passes on touched files

#### Manual

- [ ] 3.3 Test PR title appears in agent context; summary reflects intent where relevant
- [ ] 3.4 `workflow_dispatch` and local CLI still work with empty title

### Phase 4: Documentation and SHA-Pinning Alignment

#### Automated

- [ ] 4.1 `ci.yml` remote actions SHA-pinned

#### Manual

- [ ] 4.2 AGENTS.md AI Code Review section accurate
- [ ] 4.3 Branch protection requires **AI Code Review / review** after soak
- [ ] 4.4 Tier 1/2/3 CI passes after `ci.yml` pin update
