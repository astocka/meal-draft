# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Keep config changes in separate commits from schema/feature work

- **Context**: commit 896dce6 (.gitattributes, .prettierrc.json)
- **Problem**: `.gitattributes` and `.prettierrc.json` were bundled into the domain schema commit alongside migration SQL. Config-only changes mixed with feature changes make git history harder to bisect and make implementation reviews noisier (unplanned files appear in the diff).
- **Rule**: Always commit config-only changes (.gitattributes, .prettierrc.json, .eslintrc, etc.) in a separate commit before or after the feature commit, never inside it.
- **Applies to**: All feature branches; pre-commit hygiene; any commit that touches migration files.

## Populate change.md with Outcome, Prerequisites, and PRD refs

- **Context**: `context/changes/<change-id>/change.md` — every new feature or roadmap slice (`/10x-new`, `/10x-plan`, or first plan write).
- **Problem**: pantry-crud shipped without Outcome, Prerequisites, and PRD refs; those had to be added manually later. Without them, agents and reviewers cannot quickly verify slice scope, dependencies, or PRD traceability without opening `roadmap.md` and `plan.md`.
- **Rule**: When creating or updating a change folder, always include under `## Notes`: a roadmap slice reference (e.g. `S-02 from @context/foundation/roadmap.md.`), then `### Outcome`, `### Prerequisites`, and `### PRD refs` — copied from the matching slice in `context/foundation/roadmap.md`. Use `None` for Prerequisites when the slice has none.
- **Applies to**: frame, plan, plan-review, implement, impl-review

## Ask before git add or git commit

- **Context**: Any git workflow (staging, committing, phase-end commits, epilogue commits).
- **Problem**: Without explicit approval, the agent runs `git add` or `git commit` on the user's behalf, removing control over when and how changes are committed.
- **Rule**: Always ask for explicit approval before running `git add` or `git commit`; let the user stage and commit themselves if they prefer.
- **Applies to**: all

## Skip on commit approval means no approval

- **Context**: Any workflow that asks for commit approval (AskQuestion or conversation) — especially `/10x-implement` phase-end commits, `/commit-changes`, and any agent-run `git add` / `git commit`.
- **Problem**: During strict-pantry Phase 1, the agent committed after the user **skipped** the approval prompt, treating skip as consent. The user reset the commit and redid it via `/commit-changes`. Skipping is not approval; “manual testing complete” does not imply commit consent.
- **Rule**: Never run `git add` or `git commit` unless the user **explicitly** approves (e.g. selects Approve or writes “approve”). If the approval prompt is **skipped**, dismissed, or unanswered, **stop and wait** — do not commit. Do not infer consent from other messages or from completing verification steps. After implementation or verification work, do **not** auto-propose or execute commits — the user has a separate commit skill; at most suggest that now is a good moment to run it (e.g. `/commit-changes`).
- **Applies to**: all
