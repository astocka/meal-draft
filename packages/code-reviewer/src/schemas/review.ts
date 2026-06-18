import { z } from "zod";

// Scores use z.number(): structured output rejects minimum/maximum on integer types,
// so we enforce the 1-10 range via field descriptions and the prompt, not the schema alone.
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe("Implementation correctness: does the code do what it claims (scale 1-10)"),
  idiomaticity: z.number().describe("Idiomaticity: alignment with language and project conventions (scale 1-10)"),
  complexity: z.number().describe("Complexity: solution simplicity relative to the problem (scale 1-10)"),
  testRiskCoverage: z.number().describe("Test coverage proportional to risk of changed paths (scale 1-10)"),
  securitySafety: z.number().describe("Security: no vulnerabilities or secret leaks (scale 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Binding verdict for the entire change"),
  summary: z.string().describe("Markdown summary ready to post as a PR comment"),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;
