import { z } from "zod";

export const setWindow = z.object({
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).nullable().optional(),
});

export type SetWindowInput = z.infer<typeof setWindow>;
