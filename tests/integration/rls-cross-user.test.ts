import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { FavoriteMeal, GenerationHistoryEntry, PantryProduct } from "@/types";
import {
  getTestEnv,
  seedFavoriteRow,
  seedHistoryRow,
  seedPantryRow,
  signUpOrSignIn,
} from "../helpers/supabase-test-client";

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
] as const;

function missingTestEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

const missingEnv = missingTestEnvVars();

describe("RLS cross-user isolation", () => {
  if (missingEnv.length > 0) {
    it.skip(`Configure .env.test (see .env.test.example) — missing: ${missingEnv.join(", ")}`, () => {
      expect(missingEnv.length).toBeGreaterThan(0);
    });
    return;
  }

  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userAId: string;
  let userBId: string;

  let bPantry: PantryProduct;
  let aPantry: PantryProduct;
  let bFavorite: FavoriteMeal;
  let bHistory: GenerationHistoryEntry;
  let aHistory: GenerationHistoryEntry;

  const runId = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    const env = getTestEnv();

    const userA = await signUpOrSignIn(env.supabaseUrl, env.supabaseAnonKey, env.userAEmail, env.userAPassword);
    clientA = userA.client;
    userAId = userA.userId;

    const userB = await signUpOrSignIn(env.supabaseUrl, env.supabaseAnonKey, env.userBEmail, env.userBPassword);
    clientB = userB.client;
    userBId = userB.userId;

    bPantry = await seedPantryRow(clientB, userBId, `rls-b-pantry-${runId}`);
    aPantry = await seedPantryRow(clientA, userAId, `rls-a-pantry-${runId}`);
    bFavorite = await seedFavoriteRow(clientB, userBId, {
      name: `rls-b-favorite-${runId}`,
      prep_time_minutes: 10,
      ingredients: ["rice"],
      steps: ["boil"],
    });
    bHistory = await seedHistoryRow(clientB, userBId, `rls-b-history-${runId}`);
    aHistory = await seedHistoryRow(clientA, userAId, `rls-a-history-${runId}`);
  });

  describe("pantry_products", () => {
    it("SELECT returns only User A rows", async () => {
      const result = await clientA.from("pantry_products").select("id, user_id");

      expect(result.error).toBeNull();
      expect(result.data?.some((row) => row.id === bPantry.id)).toBe(false);
      expect(result.data?.every((row) => row.user_id === userAId)).toBe(true);
    });

    it("INSERT with User B user_id is denied", async () => {
      const result = await clientA.from("pantry_products").insert({ user_id: userBId, name: `rls-hijack-${runId}` });

      expect(result.error).not.toBeNull();
    });

    it("UPDATE User B row by id has no effect", async () => {
      const result = await clientA
        .from("pantry_products")
        .update({ name: "stolen-by-a" })
        .eq("id", bPantry.id)
        .select("id");

      expect(result.data ?? []).toHaveLength(0);

      const bRow = await clientB.from("pantry_products").select("name").eq("id", bPantry.id).single();
      expect(bRow.error).toBeNull();
      expect(bRow.data?.name).toBe(bPantry.name);
    });

    it("DELETE User B row has no effect", async () => {
      await clientA.from("pantry_products").delete().eq("id", bPantry.id);

      const bRow = await clientB.from("pantry_products").select("id").eq("id", bPantry.id).single();
      expect(bRow.error).toBeNull();
      expect(bRow.data?.id).toBe(bPantry.id);
    });

    it("UPDATE own row with user_id reassignment to User B is denied", async () => {
      const result = await clientA
        .from("pantry_products")
        .update({ user_id: userBId })
        .eq("id", aPantry.id)
        .select("user_id");

      expect(result.data ?? []).toHaveLength(0);

      const aRow = await clientA.from("pantry_products").select("user_id").eq("id", aPantry.id).single();
      expect(aRow.error).toBeNull();
      expect(aRow.data?.user_id).toBe(userAId);
    });
  });

  describe("favorite_meals", () => {
    it("SELECT returns only User A rows", async () => {
      const result = await clientA.from("favorite_meals").select("id, user_id");

      expect(result.error).toBeNull();
      expect(result.data?.some((row) => row.id === bFavorite.id)).toBe(false);
      expect(result.data?.every((row) => row.user_id === userAId)).toBe(true);
    });

    it("INSERT with User B user_id is denied", async () => {
      const result = await clientA.from("favorite_meals").insert({
        user_id: userBId,
        recipe: {
          name: `rls-hijack-fav-${runId}`,
          prep_time_minutes: 5,
          ingredients: ["salt"],
          steps: ["add"],
        },
        meal_type: "dinner",
      });

      expect(result.error).not.toBeNull();
    });

    it("DELETE User B row has no effect", async () => {
      await clientA.from("favorite_meals").delete().eq("id", bFavorite.id);

      const bRow = await clientB.from("favorite_meals").select("id").eq("id", bFavorite.id).single();
      expect(bRow.error).toBeNull();
      expect(bRow.data?.id).toBe(bFavorite.id);
    });
  });

  describe("generation_history", () => {
    it("SELECT returns only User A rows", async () => {
      const result = await clientA.from("generation_history").select("id, user_id");

      expect(result.error).toBeNull();
      expect(result.data?.some((row) => row.id === bHistory.id)).toBe(false);
      expect(result.data?.every((row) => row.user_id === userAId)).toBe(true);
    });

    it("INSERT with User B user_id is denied", async () => {
      const result = await clientA.from("generation_history").insert({
        user_id: userBId,
        name: `rls-hijack-history-${runId}`,
        meal_type: "dinner",
        recipe: null,
      });

      expect(result.error).not.toBeNull();
    });

    it("UPDATE own row is denied (append-only)", async () => {
      const result = await clientA
        .from("generation_history")
        .update({ name: "mutated" })
        .eq("id", aHistory.id)
        .select("id");

      expect(result.data ?? []).toHaveLength(0);

      const aRow = await clientA.from("generation_history").select("name").eq("id", aHistory.id).single();
      expect(aRow.error).toBeNull();
      expect(aRow.data?.name).toBe(aHistory.name);
    });

    it("DELETE own row is denied (append-only)", async () => {
      await clientA.from("generation_history").delete().eq("id", aHistory.id);

      const aRow = await clientA.from("generation_history").select("id").eq("id", aHistory.id).single();
      expect(aRow.error).toBeNull();
      expect(aRow.data?.id).toBe(aHistory.id);
    });

    it("UPDATE User B row is denied", async () => {
      const result = await clientA
        .from("generation_history")
        .update({ name: "stolen" })
        .eq("id", bHistory.id)
        .select("id");

      expect(result.data ?? []).toHaveLength(0);

      const bRow = await clientB.from("generation_history").select("name").eq("id", bHistory.id).single();
      expect(bRow.error).toBeNull();
      expect(bRow.data?.name).toBe(bHistory.name);
    });

    it("DELETE User B row is denied", async () => {
      await clientA.from("generation_history").delete().eq("id", bHistory.id);

      const bRow = await clientB.from("generation_history").select("id").eq("id", bHistory.id).single();
      expect(bRow.error).toBeNull();
      expect(bRow.data?.id).toBe(bHistory.id);
    });
  });
});
