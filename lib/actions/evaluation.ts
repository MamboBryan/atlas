"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require";
import { atlasServiceClient } from "@/lib/supabase/service";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  createEvaluationInput, connectSheetInput, setPanelInput, evaluationIdInput,
} from "@/lib/zod/evaluation";

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
