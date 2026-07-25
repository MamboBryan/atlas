"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { pickOne, shuffle } from "@/lib/random/pick";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import type { SupabaseClient } from "@supabase/supabase-js";

async function eligibleUserIds(
  supabase: SupabaseClient,
  meetingId?: string | null,
): Promise<string[]> {
  if (meetingId) {
    const { data: m } = await supabase
      .from("meetings")
      .select("participants_override")
      .eq("id", meetingId)
      .single();
    if (m?.participants_override) return m.participants_override as string[];
  }
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  const ids = (data ?? []).map((p: { id: string }) => p.id);
  const filtered: string[] = [];
  for (const id of ids) {
    const { data: unavail } = await supabase.rpc("atlas_is_unavailable_on", {
      uid: id,
      day: today,
    });
    if (!unavail) filtered.push(id);
  }
  return filtered;
}

export async function oneShotPick(
  meetingId?: string,
): Promise<ActionResult<{ user_id: string }>> {
  const { supabase } = await requireUser();
  const ids = await eligibleUserIds(supabase, meetingId);
  if (ids.length === 0) return err("empty_roster", "no eligible users");
  return ok({ user_id: pickOne(ids) });
}

export async function listEligibleNames(
  meetingId?: string | null,
): Promise<ActionResult<Array<{ id: string; display_name: string }>>> {
  const { supabase } = await requireUser();
  const ids = await eligibleUserIds(supabase, meetingId);
  if (ids.length === 0) return err("empty_roster", "no eligible users");
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", ids);
  if (error) return err("db_error", error.message);
  return ok(
    (data ?? []).map((p: { id: string; display_name: string }) => ({
      id: p.id,
      display_name: p.display_name,
    })),
  );
}

export async function startShuffle(
  meetingId: string | null,
): Promise<ActionResult<{ id: string }>> {
  const { user, supabase } = await requireUser();
  const ids = await eligibleUserIds(supabase, meetingId);
  if (ids.length === 0) return err("empty_roster", "no eligible users");
  const { data, error } = await supabase
    .from("shuffle_sessions")
    .insert({
      created_by: user.id,
      owner_user_id: user.id,
      meeting_id: meetingId,
      roster_snapshot: shuffle(ids),
      current_index: 0,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  return ok({ id: data.id });
}

export async function advanceShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("shuffle_sessions")
    .select("current_index,roster_snapshot")
    .eq("id", id)
    .single();
  if (!data) return err("not_found", "shuffle");
  const roster = data.roster_snapshot as string[];
  const next = data.current_index + 1;
  const finished = next >= roster.length;
  const { error } = await supabase
    .from("shuffle_sessions")
    .update({
      current_index: finished ? roster.length - 1 : next,
      status: finished ? "finished" : "active",
    })
    .eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}

export async function backShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("shuffle_sessions")
    .select("current_index")
    .eq("id", id)
    .single();
  if (!data) return err("not_found", "shuffle");
  const prev = Math.max(0, data.current_index - 1);
  const { error } = await supabase
    .from("shuffle_sessions")
    .update({ current_index: prev, status: "active" })
    .eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}

export async function restartShuffle(id: string): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("shuffle_sessions")
    .select("roster_snapshot")
    .eq("id", id)
    .single();
  if (!data) return err("not_found", "shuffle");
  const { error } = await supabase
    .from("shuffle_sessions")
    .update({
      roster_snapshot: shuffle(data.roster_snapshot as string[]),
      current_index: 0,
      status: "active",
    })
    .eq("id", id);
  if (error) return err("db_error", error.message);
  return ok(null);
}

export async function setAgendaPickerResult(
  itemId: string,
  pickerResult: { user_id: string } | { shuffle_session_id: string },
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { data: item } = await supabase
    .from("agenda_items")
    .select("id,meeting_id,kind")
    .eq("id", itemId)
    .single();
  if (!item) return err("not_found", "agenda item");
  if (item.kind !== "picker") return err("invalid_kind", "not a picker item");

  const { data: meeting } = await supabase
    .from("meetings")
    .select("host_user_id")
    .eq("id", item.meeting_id)
    .single();
  if (!meeting) return err("not_found", "meeting");
  if (meeting.host_user_id !== user.id) return err("forbidden", "host only");

  const { error } = await supabase
    .from("agenda_items")
    .update({ picker_result: pickerResult })
    .eq("id", itemId);
  if (error) return err("db_error", error.message);
  revalidatePath(`/meetings/${item.meeting_id}`);
  return ok(null);
}
