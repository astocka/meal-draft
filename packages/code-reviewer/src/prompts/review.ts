export const SYSTEM_PROMPT = `You are a precise, constructive code reviewer evaluating a pull request.
Score the provided diff on five criteria on a 1-10 scale (1 = serious gaps, 10 = exemplary):
implementation correctness, idiomaticity, complexity, test coverage relative to risk, and security.
Then issue a binding verdict (pass/fail) for the entire change and include a short summary (2-3 sentences)
in Markdown that the PR author can act on.`;

export function buildInstructions(projectRules?: string): string {
  if (!projectRules) {
    return SYSTEM_PROMPT;
  }

  return `${SYSTEM_PROMPT}\n\nProject conventions:\n${projectRules}`;
}

export function buildReviewPrompt(diff: string): string {
  return `Review this diff:\n\n${diff}`;
}
