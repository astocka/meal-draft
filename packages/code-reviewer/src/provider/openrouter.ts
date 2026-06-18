import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const DEFAULT_MODEL = "openai/gpt-4.1-nano";

export function resolveReviewModel(): string {
  return process.env.REVIEW_MODEL ?? DEFAULT_MODEL;
}

export function createOpenRouterProvider() {
  return createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

/** Cheap round-trip to verify OPENROUTER_API_KEY and model id. */
export async function pingModel(): Promise<{ model: string; reply: string }> {
  const model = resolveReviewModel();
  const openrouter = createOpenRouterProvider();

  const { text } = await generateText({
    model: openrouter(model),
    prompt: "Reply with exactly: ok",
  });

  return { model, reply: text.trim() };
}
