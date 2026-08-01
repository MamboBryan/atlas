"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import {
  startPromptTimer as startSchema,
  expirePromptTimer as expireSchema,
} from "@/lib/zod/prompt-timer";
import { ok, err, type ActionResult } from "@/lib/actions/_result";

async function loadAgendaItem(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  agendaItemId: string,
) {
  return supabase
    .from("agenda_items")
    .select(
      "id, meeting_id, prompt_id, kind, meetings:meetings!inner(id,host_user_id)",
    )
    .eq("id", agendaItemId)
    .single();
}

export async function startPromptTimer(
  input: unknown,
): Promise<ActionResult<{ timer_ends_at: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: item, error: readErr } = await loadAgendaItem(
    supabase,
    parsed.data.agenda_item_id,
  );
  if (readErr) return err("db_error", readErr.message);
  if (!item) return err("not_found", "agenda item not found");
  if (item.kind !== "prompt") return err("invalid_state", "not a prompt item");

  const hostId = (
    item as unknown as { meetings: { host_user_id: string | null } }
  ).meetings.host_user_id;
  if (hostId !== user.id) return err("forbidden", "host only");

  const endsAt = new Date(
    Date.now() + parsed.data.seconds * 1000,
  ).toISOString();

  const { error: updErr } = await supabase
    .from("agenda_items")
    .update({ timer_ends_at: endsAt })
    .eq("id", parsed.data.agenda_item_id);
  if (updErr) return err("db_error", updErr.message);

  revalidatePath(`/meetings/${item.meeting_id}`);
  return ok({ timer_ends_at: endsAt });
}

export async function expirePromptTimer(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = expireSchema.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: item, error: readErr } = await loadAgendaItem(
    supabase,
    parsed.data.agenda_item_id,
  );
  if (readErr) return err("db_error", readErr.message);
  if (!item) return err("not_found", "agenda item not found");
  if (item.kind !== "prompt") return err("invalid_state", "not a prompt item");

  const hostId = (
    item as unknown as { meetings: { host_user_id: string | null } }
  ).meetings.host_user_id;

  let permitted = hostId === user.id;
  if (!permitted && item.prompt_id) {
    const { data: prompt } = await supabase
      .from("prompts")
      .select("owner_user_id")
      .eq("id", item.prompt_id)
      .single();
    if (prompt && prompt.owner_user_id === user.id) permitted = true;
  }
  if (!permitted) return err("forbidden", "host or prompt owner only");

  if (item.prompt_id) {
    const { error: pErr } = await supabase
      .from("prompts")
      .update({ is_open: false })
      .eq("id", item.prompt_id);
    if (pErr) return err("db_error", pErr.message);
  }

  const { error: aErr } = await supabase
    .from("agenda_items")
    .update({ timer_ends_at: null })
    .eq("id", parsed.data.agenda_item_id);
  if (aErr) return err("db_error", aErr.message);

  revalidatePath(`/meetings/${item.meeting_id}`);
  return ok(null);
}
