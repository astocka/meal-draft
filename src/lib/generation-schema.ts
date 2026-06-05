import { z } from "zod";

export const generateRequestSchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner"]),
  max_prep_time_minutes: z.number().int().min(1).max(480).nullable(),
  exclude_names: z.array(z.string().max(80)).max(20).optional().default([]),
});

/** Matches `MealRecipe` returned by POST /api/generate on success. */
export const mealRecipeSchema = z.object({
  name: z.string().min(1).max(200),
  prep_time_minutes: z.number().int().positive().max(480),
  ingredients: z.array(z.string().min(1).max(500)).min(1).max(50),
  steps: z.array(z.string().min(1).max(500)).min(1).max(30),
});

export const generateSuccessBodySchema = z.object({
  recipe: mealRecipeSchema,
  history_id: z.string().min(1),
});

export const generateNoMatchBodySchema = z.object({
  recipe: z.null(),
  reason: z.literal("no_match"),
});

export const generateErrorBodySchema = z.object({
  error: z.string(),
});

export type GenerateSuccessBody = z.infer<typeof generateSuccessBodySchema>;
export type GenerateNoMatchBody = z.infer<typeof generateNoMatchBodySchema>;
export type GenerateErrorBody = z.infer<typeof generateErrorBodySchema>;
