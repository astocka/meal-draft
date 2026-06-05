import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

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

  const deleteResult = await supabase.from("favorite_meals").delete().eq("id", id).eq("user_id", user.id);

  if (deleteResult.error) {
    return Response.json({ error: "Failed to delete favorite" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
