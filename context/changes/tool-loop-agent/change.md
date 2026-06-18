---
change_id: tool-loop-agent
title: Modular ToolLoopAgent refactor in packages/code-reviewer
status: implemented
created: 2026-06-18
updated: 2026-06-18
archived_at: null
---

## Notes

Refactor `packages/code-reviewer` into domain-oriented modules for future promptfoo evals. No eval config in this change.

### Outcome

A clean `src/` tree (`agents/reviewer.ts`, `prompts/review.ts`, `provider/openrouter.ts`, `schemas/review.ts`, `cli.ts`, `index.ts`) with barrel exports for `reviewDiff`, `createReviewerAgent`, schemas, and prompt builders. Single CLI entry (`cli.ts`) handles review (stdin → JSON) and `ping` connectivity check. Old files (`schema.ts`, `reviewer.ts`, `model.ts`, `ping-cli.ts`) removed.

### Prerequisites

None

### PRD refs

None — internal agent package (M5 team coursework)
