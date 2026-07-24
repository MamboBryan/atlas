"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { createPromptInput } from "@/lib/zod/prompt";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

const YES_NO_OPTIONS = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export async function createPrompt(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPromptInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const p = parsed.data;
  const row: Record<string, unknown> = {
    created_by: user.id,
    owner_user_id: user.id,
    question: p.question,
    response_type: p.response_type,
    anonymity: p.anonymity,
    timing: p.timing,
    is_open: true,
    opens_at: p.opens_at ?? null,
    closes_at: p.closes_at ?? null,
  };
  if (p.response_type === "single_choice" || p.response_type === "multi_choice")
    row.options = p.options;
  if (p.response_type === "yes_no") row.options = YES_NO_OPTIONS;
  if (p.response_type === "rating") {
    row.rating_min = p.rating_min;
    row.rating_max = p.rating_max;
  }
  const { data, error } = await supabase
    .from("prompts")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  revalidatePath("/polls");
  return ok({ id: data.id });
}

export async function revealPrompt(
  prompt_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("prompts")
    .update({
      is_revealed: true,
      revealed_at: new Date().toISOString(),
      is_open: false,
    })
    .eq("id", prompt_id)
    .eq("owner_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}

export async function closePrompt(
  prompt_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("prompts")
    .update({ is_open: false })
    .eq("id", prompt_id)
    .eq("owner_user_id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath(`/polls/${prompt_id}`);
  return ok(null);
}
