import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const idSchema = z.uuid();

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
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleteResult = await supabase.from("favorite_meals").delete().eq("id", parsedId.data).eq("user_id", user.id);

  if (deleteResult.error) {
    return Response.json({ error: "Failed to delete favorite" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
