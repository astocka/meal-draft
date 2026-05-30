# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Keep config changes in separate commits from schema/feature work

- **Context**: commit 896dce6 (.gitattributes, .prettierrc.json)
- **Problem**: `.gitattributes` and `.prettierrc.json` were bundled into the domain schema commit alongside migration SQL. Config-only changes mixed with feature changes make git history harder to bisect and make implementation reviews noisier (unplanned files appear in the diff).
- **Rule**: Always commit config-only changes (.gitattributes, .prettierrc.json, .eslintrc, etc.) in a separate commit before or after the feature commit, never inside it.
- **Applies to**: All feature branches; pre-commit hygiene; any commit that touches migration files.
