function decodeJwtPayload(key: string): Record<string, unknown> {
  const parts = key.split(".");
  if (parts.length !== 3) {
    throw new Error("SUPABASE_KEY is not a valid Supabase JWT. Use the anon (public) key from Project Settings → API.");
  }

  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(
      "SUPABASE_KEY JWT payload could not be decoded. Use the anon (public) key from Project Settings → API.",
    );
  }
}

export function assertSupabaseAnonKey(key: string): void {
  const payload = decodeJwtPayload(key);
  if (payload.role === "service_role") {
    throw new Error("SUPABASE_KEY must be the anon (public) key, not the service_role key. Service-role bypasses RLS.");
  }
}
