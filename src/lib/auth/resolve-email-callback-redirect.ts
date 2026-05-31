import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth/auth-error-message";

export async function resolveEmailCallbackRedirect(
  requestHeaders: Headers,
  cookies: AstroCookies,
  code: string | null,
): Promise<string> {
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return `/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`;
  }

  if (!code) {
    return `/auth/signin?error=${encodeURIComponent("Invalid confirmation link")}`;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return `/auth/signin?error=${encodeURIComponent(authErrorMessage(error.code))}`;
  }

  return "/dashboard";
}
