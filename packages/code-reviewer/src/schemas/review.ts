import { z } from "zod";

// Scores use z.number(): structured output rejects minimum/maximum on integer types,
// so we enforce the 1–10 range via field descriptions and the system prompt, not the schema alone.
export const REVIEW_SCHEMA = z.object({
  islandContract: z
    .number()
    .describe(
      "Astro/React Island Contract: no 'use client'/'use server' directives; all src/pages/api/** routes export prerender=false; React used only for interactive islands. Integer 1–10 (10 = no violations, 1–4 = any hard-fail trigger present). Score below 5 mandates verdict 'fail'.",
    ),
  tailwindConventions: z
    .number()
    .describe(
      "Tailwind & Styling: all conditional/concatenated Tailwind classes use cn() from @/lib/utils; no template-literal class joins; no inline style={{}} for layout. Integer 1–10 (10 = no violations, 1–4 = any hard-fail trigger present). Score below 5 mandates verdict 'fail'.",
    ),
  supabaseSecurity: z
    .number()
    .describe(
      "Supabase Security & RLS: new tables have RLS enabled with per-operation policies; no service_role key in source or tests; migrations follow YYYYMMDDHHmmss_name.sql naming; auth uses @supabase/ssr. Integer 1–10 (10 = no violations, 1–4 = any hard-fail trigger present). Score below 5 mandates verdict 'fail'.",
    ),
  testCoverage: z
    .number()
    .describe(
      "Test Coverage vs Risk: new RLS policies have Vitest integration tests; generation.ts post-parse changes have fixture-based unit tests; new data-writing flows have E2E specs with unique data and cleanup. If relevant tests are absent from the diff, score conservatively (≤ 5) and flag it. Score below 5 mandates verdict 'fail'.",
    ),
  workerCompatibility: z
    .number()
    .describe(
      "Cloudflare Workers Compatibility: no Node-only built-ins (fs, path, Node crypto, Node Buffer) in runtime paths; secrets declared via astro:env/server not raw process.env; new secrets registered in env.schema. Integer 1–10 (10 = no violations, 1–4 = any hard-fail trigger present). Score below 5 mandates verdict 'fail'.",
    ),
  verdict: z
    .enum(["pass", "fail"])
    .describe("Binding verdict for the entire change. Must be 'fail' if any criterion is below 5."),
  summary: z
    .string()
    .describe(
      "Markdown summary (2–3 sentences) ready to post as a PR comment. Call out any hard-fail triggers and flag any criteria that could not be verified from the diff.",
    ),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;
