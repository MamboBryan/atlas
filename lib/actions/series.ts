"use server";
import { revalidatePath } from "next/cache";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireAdmin } from "@/lib/auth/require";
import {
  createSeries,
  updateSeries,
  setRotation,
  deleteSeries,
} from "@/lib/zod/series";

async function assertActiveMembers(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,is_active")
    .in("id", ids);
  if (error) return error.message;
  const found = new Map<string, boolean>(
    (data ?? []).map((r) => [r.id as string, r.is_active as boolean]),
  );
  for (const id of ids) {
    const active = found.get(id);
    if (active === undefined) return `member_missing:${id}`;
    if (!active) return `member_inactive:${id}`;
  }
  return null;
}

export async function createSeriesAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSeries.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireAdmin();

  const memberCheck = await assertActiveMembers(
    supabase,
    parsed.data.rotation_order,
  );
  if (memberCheck) return err("invalid_rotation", memberCheck);

  if (parsed.data.default_participant_ids?.length) {
    const partCheck = await assertActiveMembers(
      supabase,
      parsed.data.default_participant_ids,
    );
    if (partCheck) return err("invalid_participants", partCheck);
  }

  const { data, error } = await supabase
    .from("meeting_series")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      rrule: parsed.data.rrule,
      timezone: parsed.data.timezone,
      rotation_order: parsed.data.rotation_order,
      rotation_cursor: 0,
      default_participant_ids: parsed.data.default_participant_ids ?? null,
      agenda_template: parsed.data.agenda_template,
      created_by: user.id,
      owner_user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");

  revalidatePath("/series");
  return ok({ id: data.id as string });
}

export async function updateSeriesAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = updateSeries.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireAdmin();

  if (parsed.data.default_participant_ids?.length) {
    const partCheck = await assertActiveMembers(
      supabase,
      parsed.data.default_participant_ids,
    );
    if (partCheck) return err("invalid_participants", partCheck);
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description;
  if (parsed.data.rrule !== undefined) patch.rrule = parsed.data.rrule;
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  if (parsed.data.default_participant_ids !== undefined)
    patch.default_participant_ids = parsed.data.default_participant_ids;
  if (parsed.data.agenda_template !== undefined)
    patch.agenda_template = parsed.data.agenda_template;

  const { error } = await supabase
    .from("meeting_series")
    .update(patch)
    .eq("id", parsed.data.id);
  if (error) return err("db_error", error.message);

  revalidatePath("/series");
  revalidatePath(`/series/${parsed.data.id}`);
  return ok(null);
}

export async function setRotationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = setRotation.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireAdmin();

  const memberCheck = await assertActiveMembers(
    supabase,
    parsed.data.rotation_order,
  );
  if (memberCheck) return err("invalid_rotation", memberCheck);

  const patch: Record<string, unknown> = {
    rotation_order: parsed.data.rotation_order,
  };
  if (parsed.data.rotation_cursor !== undefined) {
    patch.rotation_cursor =
      parsed.data.rotation_cursor % parsed.data.rotation_order.length;
  } else {
    patch.rotation_cursor = 0;
  }

  const { error } = await supabase
    .from("meeting_series")
    .update(patch)
    .eq("id", parsed.data.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/series/${parsed.data.id}`);
  return ok(null);
}

export async function deleteSeriesAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deleteSeries.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("meeting_series")
    .delete()
    .eq("id", parsed.data.id);
  if (error) return err("db_error", error.message);

  revalidatePath("/series");
  return ok(null);
}
