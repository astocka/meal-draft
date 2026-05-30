import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

export async function resolveEmailCallbackRedirect(
  requestHeaders: Headers,
  cookies: AstroCookies,
  code: string | null,
): Promise<string> {
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return "/auth/signin?error=Supabase+is+not+configured";
  }

  if (!code) {
    return `/auth/signin?error=${encodeURIComponent("Invalid confirmation link")}`;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return `/auth/signin?error=${encodeURIComponent(error.message)}`;
  }

  return "/dashboard";
}
