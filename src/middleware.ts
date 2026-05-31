import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Blocklist: routes that require authentication. Add new protected routes here.
// WARNING: new pages are implicitly public if omitted — keep this list updated.
const PROTECTED_ROUTES = ["/dashboard"];
// Routes that authenticated users should not visit (redirected to /dashboard).
const AUTHENTICATED_ROUTES = ["/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) console.warn("getUser error:", error.message);
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (AUTHENTICATED_ROUTES.some((route) => context.url.pathname.startsWith(route)) && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
