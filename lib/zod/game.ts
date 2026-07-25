import { z } from "zod";

export const ensureRoundInput = z.object({
  meeting_id: z.string().uuid(),
});
export type EnsureRoundInput = z.infer<typeof ensureRoundInput>;

export const targetNumberOp = z.object({
  op: z.enum(["+", "-", "*", "/"]),
  left: z.number().int().positive(),
  right: z.number().int().positive(),
  result: z.number().int().positive(),
});

export const submitTargetNumberInput = z.object({
  round_id: z.string().uuid(),
  expression: z.array(targetNumberOp).min(1).max(10),
});
export type SubmitTargetNumberInput = z.infer<typeof submitTargetNumberInput>;

export const submitZeroInInput = z.object({
  round_id: z.string().uuid(),
  guess: z.number().int().min(1).max(1000),
});
export type SubmitZeroInInput = z.infer<typeof submitZeroInInput>;

export const finalizeRoundInput = z.object({
  round_id: z.string().uuid(),
});
export type FinalizeRoundInput = z.infer<typeof finalizeRoundInput>;
