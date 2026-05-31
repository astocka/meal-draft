import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { PantryProduct } from "@/types";

export const prerender = false;

const addSchema = z.object({
  name: z.string().min(1).max(100),
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

  const listResult = await supabase.from("pantry_products").select("*").order("name", { ascending: true });

  if (listResult.error) {
    return Response.json({ error: "Failed to fetch pantry" }, { status: 500 });
  }

  return Response.json({ items: listResult.data as PantryProduct[] }, { status: 200 });
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

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const trimmedName = parsed.data.name.trim();

  const insertResult = await supabase
    .from("pantry_products")
    .insert({ user_id: user.id, name: trimmedName })
    .select()
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return Response.json({ error: "already-in-pantry" }, { status: 409 });
    }
    return Response.json({ error: "Failed to add item" }, { status: 500 });
  }

  return Response.json({ item: insertResult.data as PantryProduct }, { status: 201 });
};
