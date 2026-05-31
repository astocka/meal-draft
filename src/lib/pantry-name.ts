import { z } from "zod";

/** Letters (any locale), spaces, hyphens, apostrophes — no digits. */
const PANTRY_NAME_RE = /^[\p{L}\s'-]+$/u;

export const pantryNameSchema = z
  .string()
  .min(1)
  .max(100)
  .transform((s) => s.trim())
  .refine((s) => s.length >= 1, { message: "Please enter a product name" })
  .refine((s) => !/\d/.test(s), { message: "Ingredient names cannot contain numbers" })
  .refine((s) => PANTRY_NAME_RE.test(s), {
    message: "Use letters, spaces, hyphens, or apostrophes only",
  });

export function getPantryNameError(name: string): string | null {
  const result = pantryNameSchema.safeParse(name);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid name";
}
