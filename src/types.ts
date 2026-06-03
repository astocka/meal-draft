export type MealType = "breakfast" | "lunch" | "dinner";

export interface MealRecipe {
  name: string;
  prep_time_minutes: number;
  ingredients: string[];
  steps: string[];
}

export interface PantryProduct {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FavoriteMeal {
  id: string;
  user_id: string;
  recipe: MealRecipe;
  saved_at: string;
}

export interface GenerationHistoryEntry {
  id: string;
  user_id: string;
  name: string;
  meal_type: MealType;
  generated_at: string;
  recipe: MealRecipe | null;
  readonly seq?: number;
}

export interface GenerateRequest {
  meal_type: MealType;
  max_prep_time_minutes: number | null;
  exclude_names?: string[];
}

/** @deprecated Prefer `GenerateSuccessBody` from `@/lib/generation-schema` (HTTP wire shape). */
export type GenerateResponse = import("@/lib/generation-schema").GenerateSuccessBody;

export type GenerationResult =
  | { status: "ok"; recipe: MealRecipe; history_id: string }
  | { status: "no_match" }
  | { status: "error" };
