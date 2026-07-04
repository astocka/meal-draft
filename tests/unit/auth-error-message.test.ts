/**
 * Unit tests for authErrorMessage().
 *
 * Covers every mapped Supabase error code and the unknown-code fallback.
 * No network, DB, or Cloudflare runtime required.
 */
import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  AUTH_FORM_INVALID_REQUEST,
  AUTH_FORM_INVALID_INPUT,
  AUTH_SERVICE_UNAVAILABLE,
} from "@/lib/auth/auth-error-message";

describe("authErrorMessage", () => {
  it("returns Polish message for invalid_credentials", () => {
    expect(authErrorMessage("invalid_credentials")).toContain("e-mail");
  });

  it("returns Polish message for email_not_confirmed", () => {
    expect(authErrorMessage("email_not_confirmed")).toContain("aktywne");
  });

  it("returns Polish message for user_already_exists", () => {
    expect(authErrorMessage("user_already_exists")).toContain("już istnieje");
  });

  it("returns Polish message for email_exists", () => {
    expect(authErrorMessage("email_exists")).toContain("już istnieje");
  });

  it("returns Polish message for over_email_send_rate_limit", () => {
    expect(authErrorMessage("over_email_send_rate_limit")).toContain("wiadomości");
  });

  it("returns Polish message for too_many_requests", () => {
    expect(authErrorMessage("too_many_requests")).toContain("Zbyt wiele");
  });

  it("returns Polish message for weak_password", () => {
    expect(authErrorMessage("weak_password")).toContain("Hasło");
  });

  it("returns Polish message for email_address_not_authorized", () => {
    expect(authErrorMessage("email_address_not_authorized")).toContain("autoryzowany");
  });

  it("returns fallback message for an unknown error code", () => {
    const msg = authErrorMessage("some_unknown_code");
    expect(msg).toBeTruthy();
    expect(msg).toContain("Coś poszło nie tak");
  });

  it("returns fallback message when code is undefined", () => {
    const msg = authErrorMessage(undefined);
    expect(msg).toContain("Coś poszło nie tak");
  });

  it("exports AUTH_FORM_INVALID_REQUEST as a non-empty Polish string", () => {
    expect(AUTH_FORM_INVALID_REQUEST).toBeTruthy();
    expect(typeof AUTH_FORM_INVALID_REQUEST).toBe("string");
  });

  it("exports AUTH_FORM_INVALID_INPUT as a non-empty Polish string", () => {
    expect(AUTH_FORM_INVALID_INPUT).toBeTruthy();
    expect(typeof AUTH_FORM_INVALID_INPUT).toBe("string");
  });

  it("exports AUTH_SERVICE_UNAVAILABLE as a non-empty Polish string", () => {
    expect(AUTH_SERVICE_UNAVAILABLE).toBeTruthy();
    expect(typeof AUTH_SERVICE_UNAVAILABLE).toBe("string");
  });
});
