import type { AstroCookies } from "astro";
import { SUPABASE_URL } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth/auth-error-message";
import { isPrivateSupabaseUrl } from "@/lib/auth/supabase-url";

const PRIVATE_SUPABASE_PREVIEW_MESSAGE =
  "Podgląd (pnpm run preview) nie łączy się z lokalnym Supabase (127.0.0.1). W .dev.vars ustaw https://twoj-projekt.supabase.co albo użyj pnpm run dev z lokalnym Supabase.";

const SUPABASE_NETWORK_MESSAGE =
  "Nie udało się połączyć z Supabase. Sprawdź SUPABASE_URL w .dev.vars (https://…supabase.co), zrestartuj preview po zmianie sekretów i upewnij się, że projekt w Supabase nie jest wstrzymany.";

function isFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("fetch failed") || error.name === "TypeError";
}

export async function resolveEmailCallbackRedirect(
  requestHeaders: Headers,
  cookies: AstroCookies,
  code: string | null,
): Promise<string> {
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return `/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`;
  }

  if (!code) {
    return `/auth/signin?error=${encodeURIComponent("Nieprawidłowy link potwierdzający")}`;
  }

  if (SUPABASE_URL && isPrivateSupabaseUrl(SUPABASE_URL)) {
    return `/auth/signin?error=${encodeURIComponent(PRIVATE_SUPABASE_PREVIEW_MESSAGE)}`;
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return `/auth/signin?error=${encodeURIComponent(authErrorMessage(error.code))}`;
    }
  } catch (caught) {
    if (isFetchFailure(caught)) {
      return `/auth/signin?error=${encodeURIComponent(SUPABASE_NETWORK_MESSAGE)}`;
    }
    throw caught;
  }

  return "/dashboard";
}
