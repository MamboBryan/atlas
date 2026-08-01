"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { createOneOff, advanceTo, postponeManual } from "@/lib/zod/meeting";
import { emit } from "@/lib/notify/emit";
import { resolveMeetingParticipants } from "@/lib/notify/participants";
import { finalizeRoundAction } from "@/lib/actions/game";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

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

  const svc = serviceClient();
  const participants = await resolveMeetingParticipants(svc, {
    participants_override: parsed.data.participants_override ?? null,
  });
  try {
    await emit(
      {
        user_ids: participants,
        kind: "meeting_scheduled",
        title: `${parsed.data.title} scheduled`,
        body: `Scheduled for ${parsed.data.scheduled_start}.`,
        link: `/meetings/${data.id}`,
        email: {
          dedupeKey: (uid) => `meeting:${data.id}:scheduled:user:${uid}`,
          payload: {
            subject: `${parsed.data.title} scheduled`,
            meetingTitle: parsed.data.title,
            when: parsed.data.scheduled_start,
            url: `${appUrl()}/meetings/${data.id}`,
          },
        },
      },
      svc,
    );
  } catch {
    // notification failure is non-fatal for meeting creation
  }

  revalidatePath("/meetings");
  return ok({ id: data.id });
}

export async function startMeeting(
  meeting_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();

  // If there's an active pre-meeting game round, finalize it first so its
  // scoreboard is written before the meeting transitions to 'live' (which
  // hides the lobby panel).
  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, status")
    .eq("meeting_id", meeting_id)
    .maybeSingle();
  if (round?.status === "active") {
    await finalizeRoundAction({ round_id: round.id });
  }

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

  // Finalize any active pre-meeting game round before ending the meeting,
  // so its results are written and visible (mirrors the startMeeting hook).
  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, status")
    .eq("meeting_id", meeting_id)
    .maybeSingle();
  if (round?.status === "active") {
    await finalizeRoundAction({ round_id: round.id });
  }

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

  // Finalize any active pre-meeting game round before postponing — the lobby
  // for the original meeting is closing; players deserve their scores.
  const { data: activeRound } = await supabase
    .from("game_rounds")
    .select("id, status")
    .eq("meeting_id", meeting.id)
    .maybeSingle();
  if (activeRound?.status === "active") {
    await finalizeRoundAction({ round_id: activeRound.id });
  }

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

  const svc = serviceClient();
  const participants = await resolveMeetingParticipants(svc, {
    participants_override: meeting.participants_override as string[] | null,
  });
  try {
    await emit(
      {
        user_ids: participants,
        kind: "meeting_postponed",
        title: `${meeting.title} postponed`,
        body: `Now scheduled for ${parsed.data.new_scheduled_start}.`,
        link: `/meetings/${inserted.id}`,
        email: {
          dedupeKey: (uid) =>
            `meeting:${meeting.id}:postponed:${parsed.data.new_scheduled_start}:user:${uid}`,
          payload: {
            subject: `${meeting.title} postponed`,
            meetingTitle: meeting.title,
            newWhen: parsed.data.new_scheduled_start,
            reason: "Manually postponed by host",
            url: `${appUrl()}/meetings/${inserted.id}`,
          },
        },
      },
      svc,
    );
  } catch {
    // notification failure non-fatal
  }

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

  const payload: { current_agenda_item_id: string | null; has_started?: true } =
    {
      current_agenda_item_id: parsed.data.item_id,
    };
  if (parsed.data.item_id != null) {
    payload.has_started = true;
  }

  const { error } = await supabase
    .from("meetings")
    .update(payload)
    .eq("id", parsed.data.meeting_id)
    .eq("host_user_id", user.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok(null);
}

export async function delegateMeetingHost(
  meetingId: string,
  newHostUserId: string,
): Promise<ActionResult<null>> {
  if (!meetingId || !newHostUserId) {
    return err("invalid_input", "meetingId and newHostUserId required");
  }

  const { user, supabase } = await requireUser();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,host_user_id,status")
    .eq("id", meetingId)
    .single();
  if (!meeting) return err("not_found", "meeting not found");
  if (meeting.host_user_id !== user.id) {
    return err("forbidden", "host only");
  }
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return err("invalid_state", "cannot delegate a finished meeting");
  }

  const { data: newHost } = await supabase
    .from("profiles")
    .select("id,is_active")
    .eq("id", newHostUserId)
    .single();
  if (!newHost || !newHost.is_active) {
    return err("invalid_input", "new host must be an active member");
  }

  const { error: updateErr } = await supabase
    .from("meetings")
    .update({ host_user_id: newHostUserId })
    .eq("id", meetingId);
  if (updateErr) return err("db_error", updateErr.message);

  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/meetings");
  return ok(null);
}
