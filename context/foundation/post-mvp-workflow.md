# Post-MVP Feature Workflow

> How to plan, implement, and document new features after the v1.0.0 MVP release.
> Edit-in-place as the process evolves.

## The three layers to keep in sync

Every post-MVP feature touches three layers. Keep all three consistent — letting any one fall behind causes agents and reviewers to work from stale context.

| Layer        | File(s)                          | Purpose                                                           |
| ------------ | -------------------------------- | ----------------------------------------------------------------- |
| Strategy     | `context/foundation/roadmap.md`  | Add the new slice row; track status                               |
| Idea parking | `context/foundation/v2-ideas.md` | Hold deferred ideas so they don't get lost or derail current work |
| Execution    | `context/changes/<change-id>/`   | One folder per feature branch; created via `/10x-new`             |

## Step-by-step process per feature

### 1. Update `roadmap.md` before touching code

Add a new row to the `## At a glance` table. This is the contract every other artifact traces back to:

- **ID** — continue the slice sequence (S-07, S-08, …)
- **Change ID** — kebab-case slug matching the branch name and change folder
- **Outcome** — one sentence written from the user's perspective ("user can …")
- **Prerequisites** — slice IDs that must be done first
- **Status** — `pending`

Change frontmatter `status` back to `active` while any slice is in progress.

### 2. Park deferred sub-ideas in `v2-ideas.md`

Any related idea that is out of scope for this slice goes to `v2-ideas.md` immediately — not in the plan, not in comments. This prevents scope creep while keeping ideas alive for the next planning session.

### 3. Create the change folder — `/10x-new`

Run `/10x-new` to scaffold `context/changes/<change-id>/change.md`. Per `context/foundation/lessons.md`, fill in `Outcome`, `Prerequisites`, and `PRD refs` immediately, copied from the new roadmap row.

### 4. Plan — `/10x-plan` → `/10x-plan-review`

Produces `context/changes/<change-id>/plan.md`. Always review the plan before writing any code. The plan is the baseline that implementation review (`/10x-impl-review`) checks against for drift.

### 5. Create the branch from `main`

```bash
git checkout main
git pull
git checkout -b feat/<change-id>
```

The branch name must match the change_id, prefixed with `feat/`. This is the established convention for feature work in this repo.

### 6. Implement — `/10x-implement` or `/10x-tdd`

Work phase by phase as defined in `plan.md`. Run `/10x-impl-review` after implementation to catch drift, missing tests, or rule violations before opening a PR.

### 7. Open a PR and let CI run

PR title follows Conventional Commits: `feat: <short outcome description>`. The three-tier CI (`ci`, `integration`, `e2e`) plus the AI Code Review workflow must all pass before merging.

### 8. Archive after merging

After merging to `main`, run `/10x-archive` to move the folder from `context/changes/` to `context/archive/YYYY-MM-DD-<change-id>/`. Then:

- Update the roadmap row status to `done`
- Add an entry under `## Done` in `roadmap.md`

## What to update in `roadmap.md` over time

- **Add new slices** to `## At a glance` with IDs continuing the sequence
- **Move parked items** from `## Parked` to a proper slice row when you decide to build them
- **Add a `## Post-MVP Streams` section** if three or more parallel tracks accumulate
- **Keep `## Done`** as the append-only shipped record — one line per slice with the archive path

Do not rewrite the PRD for each feature. The PRD is a historical artifact describing the v1 problem and success criteria. New features reference relevant PRD sections from within their own change folder.

## Anti-patterns

- **Starting code before `plan.md` exists** — the impl-review has no baseline; agents reverse-engineer intent instead of verifying it.
- **Accumulating open change folders** — keep at most 1–2 active at a time; archive completed ones promptly so `context/changes/` stays a reliable "what's in flight" view.
- **Putting feature detail in `roadmap.md`** — the roadmap is the index; detail belongs in `context/changes/<change-id>/plan.md`.
- **Skipping `v2-ideas.md`** — ideas dropped in conversation or comments are lost; ideas dropped in `v2-ideas.md` survive to the next planning session.
