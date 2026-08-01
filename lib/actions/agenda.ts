"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import {
  addAgendaItem,
  updateAgendaItem,
  reorderAgenda,
} from "@/lib/zod/meeting";

async function assertHost(meeting_id: string, user_id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("meetings")
    .select("id,host_user_id")
    .eq("id", meeting_id)
    .single();
  if (error || !data) return { ok: false as const, code: "not_found" };
  if (data.host_user_id !== user_id)
    return { ok: false as const, code: "forbidden" };
  return { ok: true as const, supabase };
}

export async function addAgendaItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addAgendaItem.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,host_user_id,status")
    .eq("id", parsed.data.meeting_id)
    .single();
  if (!meeting) return err("not_found", "meeting");
  // Any participant can add an item while the meeting is live; otherwise host-only.
  const canAdd = meeting.status === "live" || meeting.host_user_id === user.id;
  if (!canAdd) return err("forbidden", "host only");

  const { data: maxRow } = await supabase
    .from("agenda_items")
    .select("ordinal")
    .eq("meeting_id", parsed.data.meeting_id)
    .order("ordinal", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdinal = (maxRow?.ordinal ?? -1) + 1;

  const row: Record<string, unknown> = {
    meeting_id: parsed.data.meeting_id,
    ordinal: nextOrdinal,
    title: parsed.data.title,
    kind: parsed.data.kind,
  };
  if (parsed.data.kind === "prompt") row.prompt_id = parsed.data.prompt_id;
  if (parsed.data.kind === "picker")
    row.picker_config = parsed.data.picker_config;

  const { data, error } = await supabase
    .from("agenda_items")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok({ id: data.id });
}

export async function updateAgendaItemAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = updateAgendaItem.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: item } = await supabase
    .from("agenda_items")
    .select("id,meeting_id")
    .eq("id", parsed.data.id)
    .single();
  if (!item) return err("not_found", "agenda item");

  const gate = await assertHost(item.meeting_id, user.id);
  if (!gate.ok) return err(gate.code, gate.code);

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (Object.keys(patch).length === 0) return ok(null);

  const { error } = await supabase
    .from("agenda_items")
    .update(patch)
    .eq("id", parsed.data.id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${item.meeting_id}`);
  return ok(null);
}

export async function deleteAgendaItemAction(
  id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();

  const { data: item } = await supabase
    .from("agenda_items")
    .select("id,meeting_id")
    .eq("id", id)
    .single();
  if (!item) return err("not_found", "agenda item");

  const gate = await assertHost(item.meeting_id, user.id);
  if (!gate.ok) return err(gate.code, gate.code);

  const { error } = await supabase.from("agenda_items").delete().eq("id", id);
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${item.meeting_id}`);
  return ok(null);
}

export async function reorderAgendaAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = reorderAgenda.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const gate = await assertHost(parsed.data.meeting_id, user.id);
  if (!gate.ok) return err(gate.code, gate.code);

  const { data: existing, error: readErr } = await supabase
    .from("agenda_items")
    .select("id")
    .eq("meeting_id", parsed.data.meeting_id);
  if (readErr) return err("db_error", readErr.message);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const inputIds = new Set(parsed.data.item_ids);
  if (
    existingIds.size !== inputIds.size ||
    parsed.data.item_ids.some((id) => !existingIds.has(id))
  ) {
    return err("invalid_input", "item_ids must match existing agenda exactly");
  }

  const offset = existingIds.size + 100;
  for (let i = 0; i < parsed.data.item_ids.length; i++) {
    const { error } = await supabase
      .from("agenda_items")
      .update({ ordinal: offset + i })
      .eq("id", parsed.data.item_ids[i]);
    if (error) return err("db_error", error.message);
  }
  for (let i = 0; i < parsed.data.item_ids.length; i++) {
    const { error } = await supabase
      .from("agenda_items")
      .update({ ordinal: i })
      .eq("id", parsed.data.item_ids[i]);
    if (error) return err("db_error", error.message);
  }

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok(null);
}
