---
change_id: code-review-evals
title: Introduce promptfoo for AI agent evaluations
status: implemented
updated: 2026-06-21

archived_at: null
---

## Notes

Follow-up to `tool-loop-agent` — adds promptfoo eval harness for model comparison.

### Outcome

`pnpm eval` from `packages/code-reviewer/` runs one React 16→19 migration fixture against three OpenRouter models with four assertions (JSON shape, score range, hard-fail scores, LLM judge). Per-provider model selection via optional `model` param on `createReviewerAgent()` / `reviewDiff()`. Local-only; no CI tier.

### Prerequisites

- `tool-loop-agent` implemented (`packages/code-reviewer` modular `reviewDiff()` entry point)
- `OPENROUTER_API_KEY` in `packages/code-reviewer/src/.env`

### PRD refs

None — internal agent package (M5 team coursework)

### Review

- **Impl review**: `context/changes/code-review-evals/reviews/impl-review.md`
- **Verdict**: APPROVED (post-triage)
- **Triage fixes** (F1–F5): applied in triage commits
- **Accepted** (F6–F7): promptfoo 0.121.17 floor; assertion 3.3 model-selection signal by design
- **Manual verification**: `pnpm eval` ×2 — claude-haiku-4.5 passes all assertions; gpt/gemini fail assertion 3 on tailwind scoring (confirmed 2026-06-21)
- **Commits**: `c42ce89` (p1), `f23abca` + `ea53f93` + `b293f8b` (p2), `d818e25` (p3)
