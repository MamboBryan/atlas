"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  createEvaluationInput, connectSheetInput, setPanelInput, evaluationIdInput,
  confirmMappingInput, rateAnswerInput, csvImportInput,
} from "@/lib/zod/evaluation";
import { readSheet } from "@/lib/sheets/client";
import { detectMapping } from "@/lib/sheets/parse";
import { parseCsv } from "@/lib/sheets/csv";
import { syncEvaluation } from "@/lib/evaluation/sync";

export async function createEvaluationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createEvaluationInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user } = await requireAdmin();
  const svc = atlasServiceClient();
  const { data, error } = await svc.from("evaluations")
    .insert({ name: parsed.data.name, created_by: user.id }).select("id").single();
  if (error) return err("db_error", error.message);
  revalidatePath("/hiring");
  return ok({ id: data.id });
}

export async function connectSheetAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = connectSheetInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { error } = await svc.from("evaluations")
    .update({ sheet_id: parsed.data.sheetId, sheet_tab: parsed.data.sheetTab ?? null })
    .eq("id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}

export async function setPanelAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = setPanelInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { evaluationId, profileIds } = parsed.data;
  const { error } = await svc.rpc("set_evaluation_panel", {
    p_evaluation_id: evaluationId, p_profile_ids: profileIds,
  });
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}

async function setStatus(input: unknown, status: "open" | "closed"): Promise<ActionResult<null>> {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { error } = await svc.from("evaluations")
    .update({ status }).eq("id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  revalidatePath("/hiring");
  return ok(null);
}

export async function openEvaluationAction(input: unknown) { return setStatus(input, "open"); }
export async function closeEvaluationAction(input: unknown) { return setStatus(input, "closed"); }
export async function reopenEvaluationAction(input: unknown) { return setStatus(input, "open"); }

export async function previewMappingAction(input: unknown) {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { data: ev } = await svc.from("evaluations")
    .select("sheet_id,sheet_tab").eq("id", parsed.data.evaluationId).single();
  if (!ev?.sheet_id) return err("no_sheet", "connect a sheet first");
  try {
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    return ok({ detected: detectMapping(grid), sampleHeaders: grid.headers });
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}

export async function confirmMappingAction(input: unknown) {
  const parsed = confirmMappingInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const {
    evaluationId, emailColumn, nameColumn, timestampColumn, questionColumns,
    hiddenColumns, hideNames,
  } = parsed.data;
  const { data: ev } = await svc.from("evaluations")
    .select("sheet_id,sheet_tab").eq("id", evaluationId).single();
  if (!ev?.sheet_id) return err("no_sheet", "connect a sheet first");
  try {
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    const summary = await syncEvaluation(svc, evaluationId, grid,
      { emailColumn, nameColumn, timestampColumn, questionColumns, hiddenColumns, hideNames });
    await svc.from("evaluations").update({
      email_column: emailColumn, name_column: hideNames ? null : nameColumn,
      timestamp_column: timestampColumn, hide_names: hideNames, mapping_confirmed: true,
    }).eq("id", evaluationId);
    revalidatePath(`/hiring/${evaluationId}`);
    return ok(summary);
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}

export async function importCsvAction(input: unknown) {
  const parsed = csvImportInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const {
    evaluationId, csvText, emailColumn, nameColumn, timestampColumn, questionColumns,
    hiddenColumns, hideNames,
  } = parsed.data;
  try {
    const grid = parseCsv(csvText);
    const summary = await syncEvaluation(svc, evaluationId, grid,
      { emailColumn, nameColumn, timestampColumn, questionColumns, hiddenColumns, hideNames });
    await svc.from("evaluations").update({
      email_column: emailColumn, name_column: hideNames ? null : nameColumn,
      timestamp_column: timestampColumn, hide_names: hideNames,
      mapping_confirmed: true, sheet_id: null,
    }).eq("id", evaluationId);
    revalidatePath(`/hiring/${evaluationId}`);
    return ok(summary);
  } catch (e) {
    return err("csv_error", (e as Error).message);
  }
}

export async function rateAnswerAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rateAnswerInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser(); // user (RLS) client, not service
  const { evaluationId, candidateId, questionId, score } = parsed.data;
  const { error } = await supabase.from("evaluation_ratings").upsert(
    { evaluation_id: evaluationId, candidate_id: candidateId, question_id: questionId, rater_id: user.id, score },
    { onConflict: "evaluation_id,rater_id,candidate_id,question_id" },
  );
  if (error) return err("forbidden_or_closed", error.message); // RLS rejects non-panelist/closed
  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}

export async function refreshEvaluationAction(input: unknown) {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = atlasServiceClient();
  const { data: ev } = await svc.from("evaluations")
    .select("sheet_id,sheet_tab,email_column,name_column,timestamp_column,mapping_confirmed,hide_names")
    .eq("id", parsed.data.evaluationId).single();
  if (!ev?.mapping_confirmed || !ev.email_column)
    return err("not_ready", "connect a sheet and confirm mapping first");
  if (!ev.sheet_id)
    return err("no_sheet", "re-upload the CSV to update");
  try {
    const grid = await readSheet(ev.sheet_id, ev.sheet_tab);
    // Question columns = all headers minus identity columns (stable).
    const identity = new Set([ev.email_column, ev.name_column, ev.timestamp_column].filter(Boolean) as string[]);
    const nonIdentityHeaders = grid.headers.filter((h) => !identity.has(h));
    // Hidden state lives per-question; carry it forward from the existing rows.
    const { data: existingQs } = await svc.from("evaluation_questions")
      .select("column_key,is_hidden").eq("evaluation_id", parsed.data.evaluationId);
    const hiddenKeys = new Set((existingQs ?? []).filter((q) => q.is_hidden).map((q) => q.column_key));
    const questionColumns = nonIdentityHeaders.filter((h) => !hiddenKeys.has(h));
    const hiddenColumns = nonIdentityHeaders.filter((h) => hiddenKeys.has(h));
    const summary = await syncEvaluation(svc, parsed.data.evaluationId, grid, {
      emailColumn: ev.email_column, nameColumn: ev.name_column,
      timestampColumn: ev.timestamp_column, questionColumns, hiddenColumns,
      hideNames: ev.hide_names,
    });
    revalidatePath(`/hiring/${parsed.data.evaluationId}`);
    return ok(summary);
  } catch (e) {
    return err("sheet_error", (e as Error).message);
  }
}
