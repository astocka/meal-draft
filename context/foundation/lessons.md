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
