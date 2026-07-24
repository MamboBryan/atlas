"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { createOneOff, advanceTo, postponeManual } from "@/lib/zod/meeting";

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

export async function postponeMeetingManual(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = postponeManual.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: meeting, error: fetchErr } = await supabase
    .from("meetings")
    .select(
      "id,title,timezone,host_user_id,series_id,participants_override,created_by,status",
    )
    .eq("id", parsed.data.meeting_id)
    .single();
  if (fetchErr || !meeting) return err("not_found", fetchErr?.message ?? "");
  if (meeting.host_user_id !== user.id) return err("forbidden", "host only");
  if (meeting.status !== "scheduled")
    return err("invalid_state", "only scheduled meetings can be postponed");

  const { data: items } = await supabase
    .from("agenda_items")
    .select("ordinal,title,kind,prompt_id,picker_config")
    .eq("meeting_id", meeting.id)
    .order("ordinal", { ascending: true });

  const { data: inserted, error: insertErr } = await supabase
    .from("meetings")
    .insert({
      series_id: meeting.series_id,
      title: meeting.title,
      scheduled_start: parsed.data.new_scheduled_start,
      timezone: meeting.timezone,
      host_user_id: meeting.host_user_id,
      created_by: user.id,
      status: "scheduled",
      auto_postpone_count: 0,
      participants_override: meeting.participants_override,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) return err("db_error", insertErr?.message ?? "");

  if (items && items.length > 0) {
    await supabase.from("agenda_items").insert(
      items.map((it) => ({
        meeting_id: inserted.id,
        ordinal: it.ordinal,
        title: it.title,
        kind: it.kind,
        prompt_id: it.prompt_id,
        picker_config: it.picker_config,
      })),
    );
  }

  const { error: updateErr } = await supabase
    .from("meetings")
    .update({ status: "postponed" })
    .eq("id", meeting.id)
    .eq("host_user_id", user.id);
  if (updateErr) return err("db_error", updateErr.message);

  revalidatePath(`/meetings/${meeting.id}`);
  revalidatePath("/meetings");
  return ok({ id: inserted.id });
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
