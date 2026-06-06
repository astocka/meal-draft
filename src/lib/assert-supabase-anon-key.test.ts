import { describe, expect, it } from "vitest";
import { assertSupabaseAnonKey } from "./assert-supabase-anon-key";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fake-signature`;
}

describe("assertSupabaseAnonKey", () => {
  it("allows anon key", () => {
    const key = makeJwt({ role: "anon", iss: "supabase" });
    expect(() => {
      assertSupabaseAnonKey(key);
    }).not.toThrow();
  });

  it("rejects service_role key", () => {
    const key = makeJwt({ role: "service_role", iss: "supabase" });
    expect(() => {
      assertSupabaseAnonKey(key);
    }).toThrow(/service_role/);
  });

  it("rejects malformed key", () => {
    expect(() => {
      assertSupabaseAnonKey("not-a-jwt");
    }).toThrow(/not a valid Supabase JWT/);
    expect(() => {
      assertSupabaseAnonKey("a.%%%invalid%%% .c");
    }).toThrow(/could not be decoded/);
  });
});
