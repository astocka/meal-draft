import type { DietType } from "@/types";

export const DIET_TYPE_OPTIONS: { value: DietType; label: string }[] = [
  { value: "none", label: "Brak" },
  { value: "vegetarian", label: "Wegetariańska" },
  { value: "vegan", label: "Wegańska" },
  { value: "gluten_free", label: "Bezglutenowa" },
  { value: "lactose_free", label: "Bezlaktozowa" },
  { value: "anti_inflammatory", label: "Przeciwzapalna" },
];
