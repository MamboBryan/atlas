import { z } from "zod";

export const startPromptTimer = z.object({
  agenda_item_id: z.string().uuid(),
  seconds: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(300)]),
});
export type StartPromptTimerInput = z.infer<typeof startPromptTimer>;

export const expirePromptTimer = z.object({
  agenda_item_id: z.string().uuid(),
});
export type ExpirePromptTimerInput = z.infer<typeof expirePromptTimer>;
