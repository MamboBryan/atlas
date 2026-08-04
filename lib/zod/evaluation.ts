import { z } from "zod";

export const createEvaluationInput = z.object({ name: z.string().min(1).max(200) });

export const connectSheetInput = z.object({
  evaluationId: z.string().uuid(),
  sheetId: z.string().min(1),
  sheetTab: z.string().min(1).nullable().optional(),
});

export const confirmMappingInput = z.object({
  evaluationId: z.string().uuid(),
  emailColumn: z.string().min(1),
  nameColumn: z.string().min(1).nullable(),
  timestampColumn: z.string().min(1).nullable(),
  questionColumns: z.array(z.string().min(1)).min(1),
  hiddenColumns: z.array(z.string().min(1)).default([]),
  hideNames: z.boolean().default(false),
});

export const csvImportInput = confirmMappingInput.extend({
  csvText: z.string().min(1),
});

export const evaluationIdInput = z.object({ evaluationId: z.string().uuid() });

export const setPanelInput = z.object({
  evaluationId: z.string().uuid(),
  profileIds: z.array(z.string().uuid()),
});

export const rateAnswerInput = z.object({
  evaluationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  questionId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
});
