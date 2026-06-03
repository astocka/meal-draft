import {
  GENERATION_FAILED_MESSAGE,
  GENERATION_NETWORK_MESSAGE,
  GENERATION_RATE_LIMIT_MESSAGE,
  GENERATION_UNAVAILABLE_MESSAGE,
  GENERATION_UNAUTHORIZED_MESSAGE,
  GENERATION_UNKNOWN_MESSAGE,
  GENERATION_VALIDATION_MESSAGE,
} from "@/lib/generation-copy";
import { generateErrorBodySchema, generateNoMatchBodySchema, generateSuccessBodySchema } from "@/lib/generation-schema";
import type { MealRecipe } from "@/types";

export type GenerateParseResult =
  | { kind: "success"; recipe: MealRecipe; history_id: string }
  | { kind: "no_match" }
  | {
      kind: "error";
      code: "unauthorized" | "validation" | "rate_limit" | "generation_failed" | "unavailable" | "network" | "unknown";
      message: string;
    };

function parseErrorBody(body: unknown): string | null {
  const parsed = generateErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.error : null;
}

function parseSuccess200(body: unknown): GenerateParseResult | null {
  const noMatch = generateNoMatchBodySchema.safeParse(body);
  if (noMatch.success) {
    return { kind: "no_match" };
  }

  const success = generateSuccessBodySchema.safeParse(body);
  if (success.success) {
    return {
      kind: "success",
      recipe: success.data.recipe,
      history_id: success.data.history_id,
    };
  }

  return null;
}

/**
 * Narrow POST /api/generate JSON after `res.json()`.
 * Call with the HTTP status from the Response; never pass API `error` text through for 400.
 */
export function parseGenerateResponse(body: unknown, status: number): GenerateParseResult {
  if (status === 200) {
    const result = parseSuccess200(body);
    if (result) return result;
    return { kind: "error", code: "unknown", message: GENERATION_UNKNOWN_MESSAGE };
  }

  if (status === 401) {
    return { kind: "error", code: "unauthorized", message: GENERATION_UNAUTHORIZED_MESSAGE };
  }

  if (status === 400) {
    return { kind: "error", code: "validation", message: GENERATION_VALIDATION_MESSAGE };
  }

  if (status === 429) {
    const error = parseErrorBody(body);
    if (error === "rate_limit_exceeded") {
      return { kind: "error", code: "rate_limit", message: GENERATION_RATE_LIMIT_MESSAGE };
    }
    return { kind: "error", code: "unknown", message: GENERATION_UNKNOWN_MESSAGE };
  }

  if (status === 503) {
    return { kind: "error", code: "unavailable", message: GENERATION_UNAVAILABLE_MESSAGE };
  }

  if (status === 500) {
    const error = parseErrorBody(body);
    if (error === "generation_failed") {
      return { kind: "error", code: "generation_failed", message: GENERATION_FAILED_MESSAGE };
    }
    return { kind: "error", code: "generation_failed", message: GENERATION_FAILED_MESSAGE };
  }

  if (status === 0) {
    return {
      kind: "error",
      code: "network",
      message: GENERATION_NETWORK_MESSAGE,
    };
  }

  return { kind: "error", code: "unknown", message: GENERATION_UNKNOWN_MESSAGE };
}
