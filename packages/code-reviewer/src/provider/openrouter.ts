import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export function resolveReviewModel(): string {
  return process.env.REVIEW_MODEL ?? DEFAULT_MODEL;
}

export function requireOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Set it in src/.env or the environment.");
  }

  return apiKey;
}

export function createOpenRouterProvider() {
  return createOpenRouter({
    apiKey: requireOpenRouterApiKey(),
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
