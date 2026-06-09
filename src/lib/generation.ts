// generateText + Output.object used instead of generateObject: better OpenRouter compatibility with AI SDK v5 structured-output API.
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { OPENROUTER_API_KEY } from "astro:env/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealType, GenerateRequest, GenerationResult } from "@/types";

export const COOKING_STAPLES: ReadonlySet<string> = new Set([
  "woda",
  "sól",
  "sól kuchenna",
  "pieprz",
  "czarny pieprz",
  "pieprz czarny",
  "mielony pieprz",
  "biały pieprz",
  "oliwa",
  "oliwa z oliwek",
  "olej",
  "olej roślinny",
  "olej rzepakowy",
  "olej słonecznikowy",
  "masło",
  "cukier",
  "cukier biały",
  "mąka",
  "mąka pszenna",
  "mąka uniwersalna",
  "mąka kukurydziana",
]);

const MealRecipeSchema = z.object({
  name: z.string().min(1),
  prep_time_minutes: z.number().int().positive(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
});

// Fix B + strict JSON schema: all keys required (OpenAI/Azure reject optional properties).
// When no_match is true, use empty placeholders; branch on no_match before MealRecipeSchema.
const GenerationOutputSchema = z.object({
  no_match: z.boolean(),
  name: z.string(),
  prep_time_minutes: z.number().int(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

const MEAL_TYPE_PL: Record<MealType, string> = {
  breakfast: "śniadanie",
  lunch: "obiad",
  dinner: "kolacja",
};

export function buildSystemPrompt(pantryItems: string[], mealType: MealType, maxPrepTime: number | null): string {
  const staplesList = [...COOKING_STAPLES].map((item) => `- ${item}`).join("\n");
  const pantryList = pantryItems.map((item) => `- ${item}`).join("\n");

  const lines: string[] = [
    "You are an expert culinary assistant specialized in low-waste cooking.",
    "Your task is to generate a valid meal recipe based STRICTLY on the user's available ingredients.",
    "",
    "CRITICAL RULES:",
    "1. LANGUAGE: You MUST generate all user-facing text (fields: name, steps, and ingredients) in POLISH.",
    "2. INGREDIENT NAMES: In the 'ingredients' array, use each ingredient name EXACTLY as it appears in the Primary ingredients list below — do not change the grammatical form, do not add quantities.",
    "3. STRICT INVENTORY: Use ONLY ingredients from the two allowed lists below. No substitutions, no additions. Staples from the allowlist may appear in ingredients even if they are not in the pantry list.",
    "4. PREFER A RECIPE: When the pantry has at least 3 primary ingredients, default to no_match: false. Propose one simple, realistic home-cook dish (one pan or one pot is fine). The meal type does not require a multi-course or restaurant-style meal.",
    "5. NO MATCH FALLBACK: Use no_match: true only when no safe, edible dish is possible at all (e.g. only incompatible items, or a single non-cooking item). If a basic dish is possible, you must return a recipe with no_match: false.",
    "",
    "Generate a meal recipe as a JSON object with these fields (all required on every response):",
    "- no_match (boolean): true only when no recipe is possible; otherwise false",
    "- name (string): the meal's name (empty string when no_match is true)",
    "- prep_time_minutes (integer): total preparation time in minutes (> 0 when no_match is false; 0 when true)",
    "- ingredients (string[]): list of ingredients used (empty array when no_match is true)",
    "- steps (string[]): ordered list of preparation steps (empty array when no_match is true)",
    "",
    `**Primary ingredients (from the user's pantry):**\n${pantryList}`,
    "",
    `**Always available staples (allowlist):**\n${staplesList}`,
    "",
    `The meal must strictly match this category: ${MEAL_TYPE_PL[mealType]}`,
  ];

  if (maxPrepTime !== null) {
    lines.push(`prep_time_minutes must be ≤ ${maxPrepTime}.`);
  }

  lines.push(
    'Only if no dish is possible at all: no_match: true, name: "", prep_time_minutes: 0, ingredients: [], steps: []. Otherwise no_match: false with a complete recipe.',
  );

  return lines.join("\n");
}

const FAILURE_SENTINEL_NAME = "[generation failed]";

async function insertFailureSentinelRow(
  supabase: SupabaseClient,
  userId: string,
  mealType: MealType,
): Promise<boolean> {
  for (let insertAttempt = 1; insertAttempt <= 2; insertAttempt++) {
    const { error: insertError } = await supabase
      .from("generation_history")
      .insert({
        user_id: userId,
        name: FAILURE_SENTINEL_NAME,
        meal_type: mealType,
        recipe: null,
      })
      .select("id")
      .single();

    if (!insertError) {
      return true;
    }

    if (insertAttempt === 2) {
      // eslint-disable-next-line no-console
      console.error("generateMeal_failure_sentinel_insert_error", insertError);
    }
  }

  return false;
}

async function recordGenerationFailure(
  supabase: SupabaseClient,
  userId: string,
  mealType: MealType,
  cause: unknown,
): Promise<GenerationResult> {
  // eslint-disable-next-line no-console
  console.error("generation_error after retry", cause);
  await insertFailureSentinelRow(supabase, userId, mealType);
  return { status: "error" };
}

export async function generateMeal(
  supabase: SupabaseClient,
  userId: string,
  input: GenerateRequest,
): Promise<GenerationResult> {
  try {
    // Step 1: Pantry fetch
    const { data: pantryData, error: pantryError } = await supabase
      .from("pantry_products")
      .select("name")
      .eq("user_id", userId);

    if (pantryError) {
      // eslint-disable-next-line no-console
      console.error("generateMeal_pantry_fetch_error", pantryError);
      return { status: "error" };
    }

    const pantryItems: string[] = pantryData.map((row: { name: string }) => row.name);

    // Step 2: Empty pantry guard
    if (pantryItems.length === 0) {
      // eslint-disable-next-line no-console
      console.warn("no_match: empty pantry", {
        meal_type: input.meal_type,
        max_prep_time_minutes: input.max_prep_time_minutes,
        pantry_size: 0,
      });
      return { status: "no_match" };
    }

    // Step 3: Build normalised pantry name set
    const pantryNamesLower = new Set(pantryItems.map((item) => item.toLowerCase().trim()));

    // Step 4: Build system prompt
    const systemPrompt = buildSystemPrompt(pantryItems, input.meal_type, input.max_prep_time_minutes);

    // Step 5: Build user message
    const excludeNames = input.exclude_names ?? [];
    const userMessage =
      excludeNames.length > 0
        ? `Generate exactly one meal recipe. Do not suggest any of these meals: ${excludeNames.map((n) => `"${n.replace(/[\r\n\t]/g, " ")}"`).join(", ")}.`
        : "Generate exactly one meal recipe.";

    // Step 6: Attempt loop (max 2 iterations)
    const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY ?? "" });

    let attempt = 1;
    while (attempt <= 2) {
      let result: z.infer<typeof GenerationOutputSchema>;

      try {
        const { output: generatedOutput } = await generateText({
          model: openrouter("openai/gpt-4.1-nano", {
            plugins: [{ id: "response-healing" }],
            provider: { require_parameters: true },
          }),
          output: Output.object({
            schema: GenerationOutputSchema,
            name: "MealRecipeOrNoMatch",
          }),
          system: systemPrompt,
          prompt: userMessage,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(25000),
        });
        result = generatedOutput;
      } catch (err) {
        if (attempt < 2) {
          attempt++;
          continue;
        }
        return await recordGenerationFailure(supabase, userId, input.meal_type, err);
      }

      // Step 6c: No-match from model
      if (result.no_match) {
        // eslint-disable-next-line no-console
        console.warn("no_match: model decision", {
          meal_type: input.meal_type,
          max_prep_time_minutes: input.max_prep_time_minutes,
          pantry_size: pantryItems.length,
        });
        return { status: "no_match" };
      }

      // Step 6d: Strict-pantry validation — parse first to get typed recipe
      let recipe: z.infer<typeof MealRecipeSchema>;
      try {
        recipe = MealRecipeSchema.parse(result);
      } catch (err) {
        if (attempt < 2) {
          attempt++;
          continue;
        }
        return await recordGenerationFailure(supabase, userId, input.meal_type, err);
      }

      const violatingIngredient = recipe.ingredients.find(
        (ingredient) =>
          !pantryNamesLower.has(ingredient.toLowerCase().trim()) &&
          !COOKING_STAPLES.has(ingredient.toLowerCase().trim()),
      );

      if (violatingIngredient !== undefined) {
        if (attempt < 2) {
          // eslint-disable-next-line no-console
          console.warn("pantry_violation: retrying", {
            attempt,
            ingredient: violatingIngredient,
          });
          attempt++;
          continue;
        }
        // eslint-disable-next-line no-console
        console.warn("no_match: pantry violation after retry", {
          meal_type: input.meal_type,
          pantry_size: pantryItems.length,
        });
        return { status: "no_match" };
      }

      // Step 6e: History insert
      const { data: row, error: insertError } = await supabase
        .from("generation_history")
        .insert({
          user_id: userId,
          name: recipe.name,
          meal_type: input.meal_type,
          recipe,
        })
        .select("id")
        .single();

      if (insertError) {
        // eslint-disable-next-line no-console
        console.error("generateMeal_history_insert_error", insertError);
        return { status: "error" };
      }

      // Step 6f: Return success
      return { status: "ok", recipe, history_id: row.id as string };
    }

    // Should never reach here but satisfies TypeScript exhaustiveness
    return { status: "error" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("generateMeal_unexpected_error", err);
    return { status: "error" };
  }
}
