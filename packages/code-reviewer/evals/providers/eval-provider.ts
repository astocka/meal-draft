import type { ApiProvider, ProviderOptions, ProviderResponse } from "promptfoo";

import { loadPackageEnv } from "../../src/load-env.ts";
import { reviewDiff } from "../../src/index.ts";

export default class ReviewerProvider implements ApiProvider {
  private readonly model?: string;

  constructor(options: ProviderOptions) {
    const cfg = options.config as Record<string, unknown> | undefined;
    this.model = typeof cfg?.model === "string" ? cfg.model : undefined;
  }

  id() {
    return `code-reviewer/${this.model ?? "default"}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    loadPackageEnv();
    const review = await reviewDiff(prompt, undefined, this.model);
    return { output: JSON.stringify(review) };
  }
}
