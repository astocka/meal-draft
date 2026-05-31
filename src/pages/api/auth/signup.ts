import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth/auth-error-message";
import { getSiteUrl } from "@/lib/auth/get-site-url";

export const prerender = false;

const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(10),
});

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Invalid request")}`);
  }
  const parsed = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  const { email, password } = parsed.data;

  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Site URL is not configured")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(error.code))}`);
  }

  return context.redirect("/auth/confirm-email");
};
