/**
 * Risk: technical generation failure must persist a sentinel row in generation_history
 * for operational monitoring (ai-meal-generation plan — Error outcome).
 *
 * Asserts DB state, not HTTP status alone: when the LLM fails after retries,
 * a "[generation failed]" row must exist even though generateMeal returns { status: "error" }.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MealType } from "@/types";
import { getTestEnv, seedPantryRow, signUpOrSignIn } from "../helpers/supabase-test-client";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((config: unknown) => config),
  },
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => vi.fn(() => "mock-model")),
}));

import { generateText } from "ai";
import { generateMeal } from "@/lib/generation";

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_KEY", "TEST_USER_A_EMAIL", "TEST_USER_A_PASSWORD"] as const;

function missingTestEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

const SENTINEL_NAME = "[generation failed]";

describe("generation failure sentinel persistence", () => {
  const missingEnv = missingTestEnvVars();

  if (missingEnv.length > 0) {
    it.skip(`Configure .env.test (see .env.test.example) — missing: ${missingEnv.join(", ")}`, () => {
      expect(missingEnv.length).toBeGreaterThan(0);
    });
    return;
  }

  let client: SupabaseClient;
  let userId: string;
  const mealType: MealType = "lunch";
  const runId = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    const env = getTestEnv();
    const user = await signUpOrSignIn(env.supabaseUrl, env.supabaseAnonKey, env.userAEmail, env.userAPassword);
    client = user.client;
    userId = user.userId;

    await seedPantryRow(client, userId, `sentinel-test-${runId}`);
  });

  it("persists a failure sentinel row when LLM fails after retries", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("LLM provider unavailable"));

    // 1s buffer avoids clock skew vs Supabase generated_at.
    const probeAt = new Date(Date.now() - 1_000).toISOString();

    const result = await generateMeal(client, userId, {
      meal_type: mealType,
      max_prep_time_minutes: 30,
    });

    expect(result.status).toBe("error");

    const { data: rows, error } = await client
      .from("generation_history")
      .select("id, name, recipe, meal_type, generated_at")
      .eq("user_id", userId)
      .eq("name", SENTINEL_NAME)
      .eq("meal_type", mealType)
      .gte("generated_at", probeAt);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.recipe).toBeNull();
  });
});
