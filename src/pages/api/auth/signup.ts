import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_URL, INVITE_CODE, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import {
  AUTH_FORM_INVALID_INPUT,
  AUTH_FORM_INVALID_REQUEST,
  AUTH_SERVICE_UNAVAILABLE,
  authErrorMessage,
} from "@/lib/auth/auth-error-message";

export const prerender = false;

const signUpSchema = z.object({
  email: z.email({ error: "Podaj prawidłowy adres e-mail." }),
  password: z.string().min(12, { error: "Hasło musi mieć co najmniej 12 znaków." }),
  inviteCode: z.string().min(15, { error: "Kod zaproszenia jest za krótki." }),
});

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_FORM_INVALID_REQUEST)}`);
  }

  const parsed = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    inviteCode: form.get("inviteCode"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? AUTH_FORM_INVALID_INPUT;
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  const { email, password, inviteCode } = parsed.data;

  if (!INVITE_CODE || inviteCode !== INVITE_CODE) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Nieprawidłowy kod zaproszenia.")}`);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_SERVICE_UNAVAILABLE)}`);
  }

  // Intentionally bypasses @/lib/supabase wrapper — service role is required to create users
  // when public sign-ups are disabled. The anon-key guard in createClient() must not be triggered here.
  const adminClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  return context.redirect(
    `/auth/signin?success=${encodeURIComponent("Konto zostało utworzone. Możesz się teraz zalogować.")}`,
  );
};
