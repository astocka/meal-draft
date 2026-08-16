/**
 * Unit tests for filterStaplesForDiet and buildSystemPrompt diet-constraint logic.
 *
 * Pure-function tests — no DB, no network, no LLM calls required.
 * Covers all 6 DietType values for staples filtering and 4 representative
 * cases for prompt constraint injection.
 */
import { describe, expect, it, vi } from "vitest";

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

import { COOKING_STAPLES, filterStaplesForDiet, buildSystemPrompt } from "@/lib/generation";

const FIXED_PANTRY = ["jajka", "pomidory", "cebula"];

describe("filterStaplesForDiet", () => {
  it("'none' — returns COOKING_STAPLES unchanged", () => {
    const result = filterStaplesForDiet("none");
    expect(result).toBe(COOKING_STAPLES);
  });

  it("'vegetarian' — returns COOKING_STAPLES unchanged (masło is vegetarian-safe)", () => {
    const result = filterStaplesForDiet("vegetarian");
    expect(result).toBe(COOKING_STAPLES);
    expect(result.has("masło")).toBe(true);
  });

  it("'vegan' — removes masło; all non-animal staples remain", () => {
    const result = filterStaplesForDiet("vegan");
    expect(result.has("masło")).toBe(false);
    expect(result.has("oliwa")).toBe(true);
    expect(result.has("sól")).toBe(true);
    expect(result.has("olej")).toBe(true);
    expect(result.size).toBe(COOKING_STAPLES.size - 1);
  });

  it("'lactose_free' — removes masło", () => {
    const result = filterStaplesForDiet("lactose_free");
    expect(result.has("masło")).toBe(false);
    expect(result.size).toBe(COOKING_STAPLES.size - 1);
  });

  it("'gluten_free' — removes mąka, mąka pszenna, mąka uniwersalna; keeps mąka kukurydziana", () => {
    const result = filterStaplesForDiet("gluten_free");
    expect(result.has("mąka")).toBe(false);
    expect(result.has("mąka pszenna")).toBe(false);
    expect(result.has("mąka uniwersalna")).toBe(false);
    expect(result.has("mąka kukurydziana")).toBe(true);
    expect(result.size).toBe(COOKING_STAPLES.size - 3);
  });

  it("'anti_inflammatory' — returns COOKING_STAPLES unchanged", () => {
    const result = filterStaplesForDiet("anti_inflammatory");
    expect(result).toBe(COOKING_STAPLES);
  });
});

describe("buildSystemPrompt — diet constraint injection", () => {
  it("'none' — no 'Diet constraint:' line in the prompt", () => {
    const prompt = buildSystemPrompt(FIXED_PANTRY, "lunch", null, "none");
    expect(prompt).not.toContain("Diet constraint:");
  });

  it("'vegetarian' — prompt contains the vegetarian constraint line", () => {
    const prompt = buildSystemPrompt(FIXED_PANTRY, "lunch", null, "vegetarian");
    expect(prompt).toContain("Diet constraint:");
    expect(prompt).toContain("vegetarian");
  });

  it("'vegan' — prompt contains vegan constraint and does not list masło in staples", () => {
    const prompt = buildSystemPrompt(FIXED_PANTRY, "lunch", null, "vegan");
    expect(prompt).toContain("Diet constraint:");
    expect(prompt).toContain("vegan");
    expect(prompt).not.toContain("masło");
  });

  it("'gluten_free' — staples section omits mąka, mąka pszenna, mąka uniwersalna; keeps mąka kukurydziana", () => {
    const prompt = buildSystemPrompt(FIXED_PANTRY, "lunch", null, "gluten_free");
    // Plain "mąka" entry is not the last staple so it appears as "- mąka\n" when present.
    // Checking its absence with a substring that wouldn't match "mąka kukurydziana".
    expect(prompt).not.toContain("mąka pszenna");
    expect(prompt).not.toContain("mąka uniwersalna");
    expect(prompt).toContain("mąka kukurydziana");
    // Confirm the plain unqualified "mąka" entry is gone (formatted as "- mąka\n").
    expect(prompt).not.toContain("- mąka\n");
  });
});
