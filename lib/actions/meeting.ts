"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { createOneOff, advanceTo } from "@/lib/zod/meeting";

export async function createOneOffMeeting(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createOneOff.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      title: parsed.data.title,
      scheduled_start: parsed.data.scheduled_start,
      timezone: parsed.data.timezone,
      participants_override: parsed.data.participants_override ?? null,
      host_user_id: user.id,
      created_by: user.id,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");

  revalidatePath("/meetings");
  return ok({ id: data.id });
}

export async function startMeeting(
  meeting_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "live",
      started_at: new Date().toISOString(),
      auto_postpone_count: 0,
    })
    .eq("id", meeting_id)
    .eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${meeting_id}`);
  return ok(null);
}

export async function endMeeting(
  meeting_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      current_agenda_item_id: null,
    })
    .eq("id", meeting_id)
    .eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${meeting_id}`);
  return ok(null);
}

export async function advanceMeetingAgenda(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = advanceTo.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("meetings")
    .update({ current_agenda_item_id: parsed.data.item_id })
    .eq("id", parsed.data.meeting_id)
    .eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok(null);
}
