import { z } from "zod";

export const pantryNameSchema = z
  .string()
  .min(1)
  .max(100)
  .transform((s) => s.trim())
  .refine((s) => s.length >= 1, { message: "Podaj nazwę składnika" });

export function getPantryNameError(name: string): string | null {
  const result = pantryNameSchema.safeParse(name);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Nieprawidłowa nazwa";
}
