import { z } from "zod";

export const agendaTemplateItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("discussion"),
    title: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal("prompt"),
    title: z.string().min(1).max(120),
    prompt_id: z.string().uuid().nullable().optional(),
  }),
  z.object({
    kind: z.literal("picker"),
    title: z.string().min(1).max(120),
  }),
]);
export type AgendaTemplateItem = z.infer<typeof agendaTemplateItem>;

export const createSeries = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  rrule: z.string().min(1).max(512),
  timezone: z.string().min(1).max(64),
  rotation_order: z.array(z.string().uuid()).min(1),
  default_participant_ids: z
    .array(z.string().uuid())
    .min(1)
    .optional()
    .nullable(),
  agenda_template: z.array(agendaTemplateItem).default([]),
});
export type CreateSeriesInput = z.infer<typeof createSeries>;

export const updateSeries = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  rrule: z.string().min(1).max(512).optional(),
  timezone: z.string().min(1).max(64).optional(),
  default_participant_ids: z
    .array(z.string().uuid())
    .min(1)
    .nullable()
    .optional(),
  agenda_template: z.array(agendaTemplateItem).optional(),
});
export type UpdateSeriesInput = z.infer<typeof updateSeries>;

export const setRotation = z.object({
  id: z.string().uuid(),
  rotation_order: z.array(z.string().uuid()).min(1),
  rotation_cursor: z.number().int().min(0).optional(),
});
export type SetRotationInput = z.infer<typeof setRotation>;

export const deleteSeries = z.object({
  id: z.string().uuid(),
});
export type DeleteSeriesInput = z.infer<typeof deleteSeries>;
