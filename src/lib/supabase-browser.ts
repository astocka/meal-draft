import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return document.cookie
          .split("; ")
          .filter((chunk) => chunk.length > 0)
          .map((chunk) => {
            const separator = chunk.indexOf("=");
            const name = chunk.slice(0, separator);
            const value = chunk.slice(separator + 1);
            return { name, value: decodeURIComponent(value) };
          });
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const path = options.path ?? "/";
          const parts = [`${name}=${encodeURIComponent(value)}`, `path=${path}`];
          if (options.maxAge !== undefined) {
            parts.push(`max-age=${options.maxAge}`);
          }
          if (options.sameSite) {
            parts.push(`samesite=${options.sameSite}`);
          }
          if (options.secure) {
            parts.push("secure");
          }
          document.cookie = parts.join("; ");
        });
      },
    },
  });
}
