"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser, requireEvaluationOwner } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  createEvaluationInput, connectSheetInput, setPanelInput, evaluationIdInput,
  confirmMappingInput, rateAnswerInput, csvImportInput, evaluationOwnerInput,
  setEvaluationFieldInput, saveEvaluationFieldsInput,
} from "@/lib/zod/evaluation";
import { readSheet } from "@/lib/sheets/client";
import { detectMapping } from "@/lib/sheets/parse";
import { parseCsv } from "@/lib/sheets/csv";
import { syncEvaluation } from "@/lib/evaluation/sync";
import { partitionRefreshColumns } from "@/lib/evaluation/refresh";

export async function createEvaluationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createEvaluationInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user } = await requireAdmin();
  const svc = atlasServiceClient();
  const { data, error } = await svc.from("evaluations")
    .insert({ name: parsed.data.name, created_by: user.id }).select("id").single();
  if (error) return err("db_error", error.message);
  // The creator is the evaluation's first (permanent) owner.
  const { error: ownerErr } = await svc.from("evaluation_owners")
    .insert({ evaluation_id: data.id, profile_id: user.id });
  if (ownerErr) return err("db_error", ownerErr.message);
  revalidatePath("/hiring");
  return ok({ id: data.id });
}

export async function connectSheetAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = connectSheetInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
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
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  const { evaluationId, profileIds } = parsed.data;
  const { error } = await svc.rpc("set_evaluation_panel", {
    p_evaluation_id: evaluationId, p_profile_ids: profileIds,
  });
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}

export async function addEvaluationOwnerAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = evaluationOwnerInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  const { error } = await svc.from("evaluation_owners")
    .upsert({ evaluation_id: parsed.data.evaluationId, profile_id: parsed.data.profileId },
      { onConflict: "evaluation_id,profile_id" });
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}

export async function removeEvaluationOwnerAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = evaluationOwnerInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  // The original creator is a permanent owner and can never be removed.
  const { data: ev } = await svc.from("evaluations")
    .select("created_by").eq("id", parsed.data.evaluationId).single();
  if (ev?.created_by === parsed.data.profileId)
    return err("forbidden", "the original creator cannot be removed");
  const { error } = await svc.from("evaluation_owners").delete()
    .eq("evaluation_id", parsed.data.evaluationId)
    .eq("profile_id", parsed.data.profileId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}

async function setStatus(input: unknown, status: "open" | "closed"): Promise<ActionResult<null>> {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
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
  await requireEvaluationOwner(parsed.data.evaluationId);
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
  await requireEvaluationOwner(parsed.data.evaluationId);
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
  await requireEvaluationOwner(parsed.data.evaluationId);
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

export async function setEvaluationFieldAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = setEvaluationFieldInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
  const svc = atlasServiceClient();
  const { data: ev } = await svc.from("evaluations")
    .select("status").eq("id", parsed.data.evaluationId).single();
  if (ev?.status === "closed")
    return err("locked", "fields are locked after the evaluation is closed");
  const patch: { is_active?: boolean; is_hidden?: boolean } = {};
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
  if (parsed.data.isHidden !== undefined) patch.is_hidden = parsed.data.isHidden;
  if (Object.keys(patch).length === 0) return ok(null);
  const { error } = await svc.from("evaluation_questions")
    .update(patch).eq("id", parsed.data.questionId)
    .eq("evaluation_id", parsed.data.evaluationId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/hiring/${parsed.data.evaluationId}`);
  return ok(null);
}

// Batched save of the whole field mapping from the Fields tab. Persists roles
// and keeps the evaluation in draft (separate from opening). Owner-gated,
// rejects when closed. Partial mappings are allowed to save — "Open evaluation"
// is the gate that requires a valid mapping.
export async function saveEvaluationFieldsAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = saveEvaluationFieldsInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { evaluationId, fields } = parsed.data;
  await requireEvaluationOwner(evaluationId);
  const svc = atlasServiceClient();
  const { data: ev } = await svc.from("evaluations")
    .select("status").eq("id", evaluationId).single();
  if (ev?.status === "closed")
    return err("locked", "fields are locked after the evaluation is closed");

  const columns = fields.map((f) => f.column);
  if (new Set(columns).size !== columns.length)
    return err("invalid_input", "a column appears more than once");
  for (const role of ["email", "name", "timestamp"] as const) {
    if (fields.filter((f) => f.role === role).length > 1)
      return err("invalid_input", `only one ${role} column is allowed`);
  }

  const emailColumn = fields.find((f) => f.role === "email")?.column ?? null;
  const nameColumn = fields.find((f) => f.role === "name")?.column ?? null;
  const timestampColumn = fields.find((f) => f.role === "timestamp")?.column ?? null;
  const identityCols = new Set(
    [emailColumn, nameColumn, timestampColumn].filter(Boolean) as string[],
  );

  // Non-identity columns become questions: question=scored, context=hidden,
  // ignore=disabled. `position` is required (not-null), so number by list order.
  const qRows = fields
    .filter((f) => !identityCols.has(f.column))
    .map((f, i) => ({
      evaluation_id: evaluationId, column_key: f.column, prompt: f.label, position: i,
      is_active: f.role !== "ignore", is_hidden: f.role === "context",
    }));
  if (qRows.length) {
    const { error } = await svc.from("evaluation_questions")
      .upsert(qRows, { onConflict: "evaluation_id,column_key" });
    if (error) return err("db_error", error.message);
  }

  // Identity columns must not double as questions — deactivate any question row.
  if (identityCols.size) {
    const { error } = await svc.from("evaluation_questions")
      .update({ is_active: false })
      .eq("evaluation_id", evaluationId).in("column_key", [...identityCols]);
    if (error) return err("db_error", error.message);
  }

  const { error: evErr } = await svc.from("evaluations")
    .update({ email_column: emailColumn, name_column: nameColumn, timestamp_column: timestampColumn })
    .eq("id", evaluationId);
  if (evErr) return err("db_error", evErr.message);

  revalidatePath(`/hiring/${evaluationId}`);
  return ok(null);
}

export async function refreshEvaluationAction(input: unknown) {
  const parsed = evaluationIdInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireEvaluationOwner(parsed.data.evaluationId);
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
    // Hidden/disabled state lives per-question; carry it forward from the existing rows.
    const { data: existingQs } = await svc.from("evaluation_questions")
      .select("column_key,is_active,is_hidden").eq("evaluation_id", parsed.data.evaluationId);
    const { questionColumns, hiddenColumns } =
      partitionRefreshColumns(existingQs ?? [], nonIdentityHeaders);
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
