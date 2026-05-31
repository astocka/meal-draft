import type { APIRoute } from "astro";
import { z } from "zod";
import { pantryNameSchema } from "@/lib/pantry-name";
import { createClient } from "@/lib/supabase";
import type { PantryProduct } from "@/types";

export const prerender = false;

const renameSchema = z.object({
  name: pantryNameSchema,
});

export const PATCH: APIRoute = async (context) => {
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

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const trimmedName = parsed.data.name;
  const { id } = context.params;

  const patchResult = await supabase
    .from("pantry_products")
    .update({ name: trimmedName })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (patchResult.error) {
    if (patchResult.error.code === "23505") {
      return Response.json({ error: "already-in-pantry" }, { status: 409 });
    }
    return Response.json({ error: "Failed to rename item" }, { status: 500 });
  }

  if (!patchResult.data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ item: patchResult.data as PantryProduct }, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = context.params;

  const deleteResult = await supabase.from("pantry_products").delete().eq("id", id).eq("user_id", user.id);

  if (deleteResult.error) {
    return Response.json({ error: "Failed to delete item" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
