/**
 * Unit tests for the signup validation schema.
 *
 * Covers the password minimum (12 chars) and invite-code minimum (15 chars)
 * that were introduced with invite-gated signup. No network or DB required.
 */
import { describe, expect, it } from "vitest";
import { signUpSchema, SIGNUP_PASSWORD_MIN, SIGNUP_INVITE_CODE_MIN } from "@/lib/auth/signup-schema";

const VALID_EMAIL = "user@example.com";
const VALID_PASSWORD = "a".repeat(SIGNUP_PASSWORD_MIN);
const VALID_INVITE = "a".repeat(SIGNUP_INVITE_CODE_MIN);

describe("signUpSchema", () => {
  describe("email", () => {
    it("rejects a missing email", () => {
      const result = signUpSchema.safeParse({ email: "", password: VALID_PASSWORD, inviteCode: VALID_INVITE });
      expect(result.success).toBe(false);
    });

    it("rejects a malformed email", () => {
      const result = signUpSchema.safeParse({
        email: "not-an-email",
        password: VALID_PASSWORD,
        inviteCode: VALID_INVITE,
      });
      expect(result.success).toBe(false);
    });

    it("accepts a valid email", () => {
      const result = signUpSchema.safeParse({ email: VALID_EMAIL, password: VALID_PASSWORD, inviteCode: VALID_INVITE });
      expect(result.success).toBe(true);
    });
  });

  describe("password — minimum length", () => {
    it(`rejects a password shorter than ${String(SIGNUP_PASSWORD_MIN)} characters`, () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: "a".repeat(SIGNUP_PASSWORD_MIN - 1),
        inviteCode: VALID_INVITE,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues[0]?.message ?? "";
        expect(msg).toContain("12");
      }
    });

    it(`accepts a password of exactly ${String(SIGNUP_PASSWORD_MIN)} characters`, () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: "a".repeat(SIGNUP_PASSWORD_MIN),
        inviteCode: VALID_INVITE,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a password longer than the minimum", () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: "a".repeat(SIGNUP_PASSWORD_MIN + 10),
        inviteCode: VALID_INVITE,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invite code — minimum length", () => {
    it(`rejects an invite code shorter than ${String(SIGNUP_INVITE_CODE_MIN)} characters`, () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        inviteCode: "a".repeat(SIGNUP_INVITE_CODE_MIN - 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues[0]?.message ?? "";
        expect(msg.toLowerCase()).toContain("zaproszenia");
      }
    });

    it(`accepts an invite code of exactly ${String(SIGNUP_INVITE_CODE_MIN)} characters`, () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        inviteCode: "a".repeat(SIGNUP_INVITE_CODE_MIN),
      });
      expect(result.success).toBe(true);
    });

    it("accepts an invite code longer than the minimum", () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        inviteCode: "a".repeat(SIGNUP_INVITE_CODE_MIN + 10),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("all fields valid", () => {
    it("parses and returns typed data for a fully valid input", () => {
      const result = signUpSchema.safeParse({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        inviteCode: VALID_INVITE,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe(VALID_EMAIL);
        expect(result.data.password).toBe(VALID_PASSWORD);
        expect(result.data.inviteCode).toBe(VALID_INVITE);
      }
    });
  });
});
