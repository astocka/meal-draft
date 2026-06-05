import type { MealType } from "@/types";

export const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Śniadanie" },
  { value: "lunch", label: "Obiad" },
  { value: "dinner", label: "Kolacja" },
];
