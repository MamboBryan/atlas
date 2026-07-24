import { z } from "zod";

export const option = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
});

const baseFields = {
  question: z.string().min(1).max(500),
  anonymity: z.enum(["attributed", "hard_anonymous"]),
  timing: z.enum(["async", "live"]).default("async"),
  opens_at: z.string().datetime().optional(),
  closes_at: z.string().datetime().optional(),
};

export const createPromptInput = z.discriminatedUnion("response_type", [
  z.object({
    response_type: z.literal("text"),
    ...baseFields,
  }),
  z.object({
    response_type: z.literal("single_choice"),
    ...baseFields,
    options: z.array(option).min(2).max(20),
  }),
  z.object({
    response_type: z.literal("multi_choice"),
    ...baseFields,
    options: z.array(option).min(2).max(20),
  }),
  z.object({
    response_type: z.literal("yes_no"),
    ...baseFields,
  }),
  z.object({
    response_type: z.literal("rating"),
    ...baseFields,
    rating_min: z.literal(1).default(1),
    rating_max: z.union([z.literal(5), z.literal(10)]).default(5),
  }),
]);

export type CreatePromptInput = z.infer<typeof createPromptInput>;
