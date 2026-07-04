import type { APIRoute } from "astro";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { env } from "cloudflare:workers";
import { SUPABASE_URL, INVITE_CODE } from "astro:env/server";
import {
  AUTH_FORM_INVALID_INPUT,
  AUTH_FORM_INVALID_REQUEST,
  AUTH_SERVICE_UNAVAILABLE,
  authErrorMessage,
} from "@/lib/auth/auth-error-message";
import { signUpSchema } from "@/lib/auth/signup-schema";

export const prerender = false;

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

  // SUPABASE_SERVICE_ROLE_KEY is intentionally excluded from astro:env/server schema so it
  // cannot be accidentally imported elsewhere in the app (it bypasses RLS). It is read once
  // here, directly from the Cloudflare Workers env (Astro v6+), scoped to this file only.
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

  if (!SUPABASE_URL || !serviceRoleKey) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_SERVICE_UNAVAILABLE)}`);
  }

  // Uses service-role admin client to create users when public sign-ups are disabled
  // in Supabase. Key is read from Cloudflare Workers env — never from astro:env/server.
  const adminClient = createAdminClient(SUPABASE_URL, serviceRoleKey);

  let createError: { code?: string } | null = null;
  try {
    const { error } = await adminClient.auth.admin.createUser({
      email,
      password,
      // Mark email verified in Supabase so sign-in works immediately after signup.
      // Registration is gated by invite code — no separate email confirmation flow.
      email_confirm: true,
    });
    createError = error;
  } catch {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_SERVICE_UNAVAILABLE)}`);
  }

  if (createError) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(createError.code))}`);
  }

  return context.redirect(
    `/auth/signin?success=${encodeURIComponent("Konto zostało utworzone. Możesz się teraz zalogować.")}`,
  );
};
