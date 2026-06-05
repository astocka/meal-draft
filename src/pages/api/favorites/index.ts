import type { APIRoute } from "astro";
import { z } from "zod";
import { mealRecipeSchema } from "@/lib/generation-schema";
import { createClient } from "@/lib/supabase";
import type { FavoriteMeal } from "@/types";

export const prerender = false;

const addFavoriteSchema = z.object({
  recipe: mealRecipeSchema,
});

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const listResult = await supabase
    .from("favorite_meals")
    .select("*")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (listResult.error) {
    return Response.json({ error: "Failed to fetch favorites" }, { status: 500 });
  }

  return Response.json({ items: listResult.data as FavoriteMeal[] }, { status: 200 });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addFavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const insertResult = await supabase
    .from("favorite_meals")
    .insert({ user_id: user.id, recipe: parsed.data.recipe })
    .select()
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return Response.json({ error: "already-favorited" }, { status: 409 });
    }
    return Response.json({ error: "Failed to add favorite" }, { status: 500 });
  }

  return Response.json({ item: insertResult.data as FavoriteMeal }, { status: 201 });
};
