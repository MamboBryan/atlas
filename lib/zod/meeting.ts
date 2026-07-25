import { z } from "zod";

export const createOneOff = z.object({
  title: z.string().min(1).max(120),
  scheduled_start: z.string().datetime(),
  timezone: z.string().min(1).max(64),
  participants_override: z.array(z.string().uuid()).min(1).nullable().optional(),
});
export type CreateOneOffInput = z.infer<typeof createOneOff>;

export const pickerConfig = z.object({
  mode: z.enum(["oneshot", "shuffle"]),
  scope: z.enum(["whole_roster", "meeting_participants"]),
});
export type PickerConfig = z.infer<typeof pickerConfig>;

export const addAgendaItem = z.discriminatedUnion("kind", [
  z.object({
    meeting_id: z.string().uuid(),
    kind: z.literal("discussion"),
    title: z.string().min(1).max(120),
  }),
  z.object({
    meeting_id: z.string().uuid(),
    kind: z.literal("prompt"),
    title: z.string().min(1).max(120),
    prompt_id: z.string().uuid(),
  }),
  z.object({
    meeting_id: z.string().uuid(),
    kind: z.literal("picker"),
    title: z.string().min(1).max(120),
    picker_config: pickerConfig,
  }),
]);
export type AddAgendaItemInput = z.infer<typeof addAgendaItem>;

export const updateAgendaItem = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
});
export type UpdateAgendaItemInput = z.infer<typeof updateAgendaItem>;

export const reorderAgenda = z.object({
  meeting_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()).min(1),
});
export type ReorderAgendaInput = z.infer<typeof reorderAgenda>;

export const advanceTo = z.object({
  meeting_id: z.string().uuid(),
  item_id: z.string().uuid().nullable(),
});
export type AdvanceToInput = z.infer<typeof advanceTo>;

export const postponeManual = z.object({
  meeting_id: z.string().uuid(),
  new_scheduled_start: z.string().datetime(),
});
export type PostponeManualInput = z.infer<typeof postponeManual>;
