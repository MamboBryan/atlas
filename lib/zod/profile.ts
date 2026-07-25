import { z } from "zod";

export const profileUpdate = z.object({
  display_name: z.string().min(1).max(80),
  avatar_url: z.string().url().max(500).nullable().optional(),
  email_prefs: z.record(z.string(), z.boolean()).optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdate>;
