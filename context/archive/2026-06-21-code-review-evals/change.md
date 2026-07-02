---
change_id: code-review-evals
title: Introduce promptfoo for AI agent evaluations
status: archived
created: 2026-06-21
updated: 2026-07-02
archived_at: 2026-07-02T17:11:26Z
---

## Notes

Follow-up to `tool-loop-agent` — adds promptfoo eval harness for model comparison.

### Outcome

`pnpm eval` from `packages/code-reviewer/` runs one React 16→19 migration fixture against three OpenRouter models (`gpt-4o-mini`, `claude-haiku-4.5`, `claude-sonnet-4.6`) with four assertions (JSON shape, score range, hard-fail scores, LLM judge). Per-provider model selection via optional `model` param on `createReviewerAgent()` / `reviewDiff()`. Local-only; no CI tier. **Default model:** `anthropic/claude-haiku-4.5` (eval-selected).

### Prerequisites

- `tool-loop-agent` implemented (`packages/code-reviewer` modular `reviewDiff()` entry point)
- `OPENROUTER_API_KEY` in `packages/code-reviewer/src/.env`

### PRD refs

None — internal agent package (M5 team coursework)

### Model selection (post-eval)

| Model                         | Pass/fail (×2 runs) | Notes                                                           |
| ----------------------------- | ------------------- | --------------------------------------------------------------- |
| `openai/gpt-4o-mini`          | FAIL / FAIL         | Assertion 3: run1 tailwind=6 worker=5; run2 tailwind=4 worker=5 |
| `anthropic/claude-haiku-4.5`  | PASS / PASS         | Selected as `REVIEW_MODEL` — same pass rate as sonnet, faster   |
| `anthropic/claude-sonnet-4.6` | PASS / PASS         | Premium; no pass-rate gain over haiku on this fixture           |

### Review

- **Impl review**: `context/changes/code-review-evals/reviews/impl-review.md`
- **Verdict**: APPROVED (post-triage)
- **Triage fixes** (F1–F5): applied in triage commits
- **Accepted** (F6–F7): promptfoo 0.121.17 floor; assertion 3.3 model-selection signal by design
- **Manual verification**: `pnpm eval` ×2 (2026-06-21, sonnet lineup) — 2 PASS / 1 FAIL stable; `typecheck:evals` passes; `REVIEW_MODEL=anthropic/claude-haiku-4.5` set in `src/.env`
- **Commits**: `c42ce89` (p1), `f23abca` + `ea53f93` + `b293f8b` (p2), `d818e25` (p3); model lineup swap (gemini → sonnet) post-p3
