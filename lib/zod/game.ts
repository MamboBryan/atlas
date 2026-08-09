import { z } from "zod";

export const startRoundInput = z.object({
  agenda_item_id: z.string().uuid(),
});
export type StartRoundInput = z.infer<typeof startRoundInput>;

export const meetingRoundsInput = z.object({
  meeting_id: z.string().uuid(),
});
export type MeetingRoundsInput = z.infer<typeof meetingRoundsInput>;

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
