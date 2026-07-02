import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import {
  AUTH_FORM_INVALID_INPUT,
  AUTH_FORM_INVALID_REQUEST,
  AUTH_SERVICE_UNAVAILABLE,
  authErrorMessage,
} from "@/lib/auth/auth-error-message";

export const prerender = false;

const signInSchema = z.object({
  email: z.email({ error: "Podaj prawidłowy adres e-mail." }),
  password: z.string().min(1, { error: "Hasło jest wymagane." }),
});

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(AUTH_FORM_INVALID_REQUEST)}`);
  }
  const parsed = signInSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? AUTH_FORM_INVALID_INPUT;
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  const { email, password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(AUTH_SERVICE_UNAVAILABLE)}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  return context.redirect("/dashboard");
};
