import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseAnonKey } from "@/lib/assert-supabase-anon-key";
import type { FavoriteMeal, GenerationHistoryEntry, MealRecipe, MealType, PantryProduct } from "@/types";

export interface TestEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  userAEmail: string;
  userAPassword: string;
  userBEmail: string;
  userBPassword: string;
}

const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
] as const;

function readEnv(name: (typeof REQUIRED_VARS)[number]): string {
  return process.env[name]?.trim() ?? "";
}

export function getTestEnv(): TestEnv {
  const missing = REQUIRED_VARS.filter((name) => readEnv(name) === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing test environment variables: ${missing.join(", ")}. Copy .env.test.example to .env.test and configure.`,
    );
  }

  return {
    supabaseUrl: readEnv("SUPABASE_URL"),
    supabaseAnonKey: readEnv("SUPABASE_KEY"),
    userAEmail: readEnv("TEST_USER_A_EMAIL"),
    userAPassword: readEnv("TEST_USER_A_PASSWORD"),
    userBEmail: readEnv("TEST_USER_B_EMAIL"),
    userBPassword: readEnv("TEST_USER_B_PASSWORD"),
  };
}

export function createAuthClient(url: string, anonKey: string) {
  assertSupabaseAnonKey(anonKey);
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function signUpOrSignIn(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createAuthClient(url, anonKey);

  const signUp = await client.auth.signUp({ email, password });
  if (signUp.data.user?.id && !signUp.error) {
    return { client, userId: signUp.data.user.id };
  }

  const signIn = await client.auth.signInWithPassword({ email, password });
  const signedInUser = signIn.data.user;
  if (signIn.error !== null || signedInUser === null) {
    const message = signIn.error !== null ? signIn.error.message : (signUp.error?.message ?? "no user id");
    throw new Error(`Failed to sign up or sign in test user ${email}: ${message}`);
  }

  return { client, userId: signedInUser.id };
}

const defaultRecipe: MealRecipe = {
  name: "Test Recipe",
  prep_time_minutes: 15,
  ingredients: ["egg"],
  steps: ["cook"],
};

export async function seedPantryRow(client: SupabaseClient, userId: string, name: string): Promise<PantryProduct> {
  const result = await client.from("pantry_products").insert({ user_id: userId, name }).select().single();
  if (result.error) {
    throw new Error(`seedPantryRow failed: ${result.error.message}`);
  }
  return result.data as PantryProduct;
}

export async function seedFavoriteRow(
  client: SupabaseClient,
  userId: string,
  recipe: MealRecipe = defaultRecipe,
  mealType: MealType = "lunch",
): Promise<FavoriteMeal> {
  const result = await client
    .from("favorite_meals")
    .insert({ user_id: userId, recipe, meal_type: mealType })
    .select()
    .single();
  if (result.error) {
    throw new Error(`seedFavoriteRow failed: ${result.error.message}`);
  }
  return result.data as FavoriteMeal;
}

export async function seedHistoryRow(
  client: SupabaseClient,
  userId: string,
  name = "Test Meal",
  mealType: MealType = "lunch",
): Promise<GenerationHistoryEntry> {
  const result = await client
    .from("generation_history")
    .insert({ user_id: userId, name, meal_type: mealType, recipe: null })
    .select()
    .single();
  if (result.error) {
    throw new Error(`seedHistoryRow failed: ${result.error.message}`);
  }
  return result.data as GenerationHistoryEntry;
}
