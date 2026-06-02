import { z } from "zod";

export const generateRequestSchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner"]),
  max_prep_time_minutes: z.number().int().min(1).max(480).nullable(),
  exclude_names: z.array(z.string().max(80)).max(20).optional().default([]),
});
