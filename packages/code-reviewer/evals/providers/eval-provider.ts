import type { ApiProvider, ProviderOptions, ProviderResponse } from "promptfoo";

import { loadPackageEnv } from "../../src/load-env.ts";
import { reviewDiff } from "../../src/index.ts";
import { requireOpenRouterApiKey } from "../../src/provider/openrouter.ts";

export default class ReviewerProvider implements ApiProvider {
  private readonly model: string;

  constructor(options: ProviderOptions) {
    const cfg = options.config as Record<string, unknown> | undefined;
    const model = typeof cfg?.model === "string" ? cfg.model : undefined;
    if (!model) {
      throw new Error(
        "eval-provider requires config.model — omitting it would fall back to OPENROUTER_MODEL and break model comparison",
      );
    }
    this.model = model;
  }

  id() {
    return `code-reviewer/${this.model}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    loadPackageEnv();
    try {
      requireOpenRouterApiKey();
      const review = await reviewDiff(prompt, undefined, this.model);
      return { output: JSON.stringify(review) };
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
