import { z } from "zod";

export const PANTRY_NAME_REQUIRED_MESSAGE = "Podaj nazwę składnika";

export const pantryNameSchema = z
  .string()
  .min(1, { message: PANTRY_NAME_REQUIRED_MESSAGE })
  .max(100, { message: "Nazwa może mieć maksymalnie 100 znaków" })
  .transform((s) => s.trim())
  .refine((s) => s.length >= 1, { message: PANTRY_NAME_REQUIRED_MESSAGE });

export function getPantryNameError(name: string): string | null {
  const result = pantryNameSchema.safeParse(name);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Nieprawidłowa nazwa";
}
