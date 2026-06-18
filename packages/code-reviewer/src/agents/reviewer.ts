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

  return output;
}
