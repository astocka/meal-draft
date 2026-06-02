import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createClient } from "@/lib/supabase";
import { generateRequestSchema } from "@/lib/generation-schema";
import { generateMeal } from "@/lib/generation";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour

async function isRateLimited(userId: string): Promise<boolean> {
  try {
    const slot = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const key = `rl:${userId}:${slot}`;
    const raw = await env.RATE_LIMIT.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= RATE_LIMIT_MAX) return true;
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 7200 });
    return false;
  } catch {
    // Fail-open when KV is unavailable (e.g. local astro dev on Node).
    return false;
  }
}

export const prerender = false;

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

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (await isRateLimited(user.id)) {
    return Response.json({ error: "rate_limit_exceeded" }, { status: 429 });
  }

  const result = await generateMeal(supabase, user.id, parsed.data);

  if (result.status === "ok") {
    return Response.json({ recipe: result.recipe, history_id: result.history_id }, { status: 200 });
  }

  if (result.status === "no_match") {
    return Response.json({ recipe: null, reason: "no_match" }, { status: 200 });
  }

  return Response.json({ error: "generation_failed" }, { status: 500 });
};
