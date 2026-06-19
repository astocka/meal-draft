import { Output, ToolLoopAgent, stepCountIs } from "ai";

import { loadProjectRules } from "../project-rules.ts";
import { createOpenRouterProvider, resolveReviewModel } from "../provider/openrouter.ts";
import { buildInstructions, buildReviewPrompt } from "../prompts/review.ts";
import { REVIEW_SCHEMA, type Review } from "../schemas/review.ts";

export function createReviewerAgent(projectRules = loadProjectRules()) {
  const openrouter = createOpenRouterProvider();

  return new ToolLoopAgent({
    model: openrouter(resolveReviewModel()),
    instructions: buildInstructions(projectRules || undefined),
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: stepCountIs(2),
  });
}

export async function reviewDiff(diff: string, projectRules?: string): Promise<Review> {
  const reviewer = createReviewerAgent(projectRules);
  const { output } = await reviewer.generate({
    prompt: buildReviewPrompt(diff),
  });

  // Runtime guard: SDK types output as always defined; fail loudly for CLI/eval consumers.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- structured output can be absent at runtime
  if (output == null) {
    throw new Error("Code review agent returned no structured output.");
  }

  return output;
}
