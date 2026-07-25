"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import {
  postComment as postCommentSchema,
  deleteMyComment as deleteMyCommentSchema,
  toggleReaction as toggleReactionSchema,
} from "@/lib/zod/comment";
import { ok, err, type ActionResult } from "@/lib/actions/_result";

export async function postComment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = postCommentSchema.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from("meeting_comments")
    .insert({
      meeting_id: parsed.data.meeting_id,
      agenda_item_id: parsed.data.agenda_item_id,
      author_user_id: user.id,
      body: parsed.data.body,
    })
    .select("id")
    .single();
  if (error) return err("db_error", error.message);

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok({ id: data.id as string });
}

export async function deleteMyComment(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deleteMyCommentSchema.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { error } = await supabase
    .from("meeting_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.comment_id)
    .eq("author_user_id", user.id)
    .is("deleted_at", null);
  if (error) return err("db_error", error.message);

  return ok(null);
}

export async function toggleReaction(
  input: unknown,
): Promise<ActionResult<{ mine: boolean }>> {
  const parsed = toggleReactionSchema.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: existing, error: readErr } = await supabase
    .from("meeting_comment_reactions")
    .select("comment_id")
    .eq("comment_id", parsed.data.comment_id)
    .eq("user_id", user.id)
    .eq("emoji", parsed.data.emoji)
    .maybeSingle();
  if (readErr) return err("db_error", readErr.message);

  if (existing) {
    const { error: delErr } = await supabase
      .from("meeting_comment_reactions")
      .delete()
      .eq("comment_id", parsed.data.comment_id)
      .eq("user_id", user.id)
      .eq("emoji", parsed.data.emoji);
    if (delErr) return err("db_error", delErr.message);
    return ok({ mine: false });
  }

  const { error: insErr } = await supabase
    .from("meeting_comment_reactions")
    .insert({
      comment_id: parsed.data.comment_id,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
  if (insErr) return err("db_error", insErr.message);
  return ok({ mine: true });
}
