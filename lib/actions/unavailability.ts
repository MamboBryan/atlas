"use server";
import { revalidatePath } from "next/cache";
import { setWindow } from "@/lib/zod/unavailability";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireUser } from "@/lib/auth/require";

export async function setUnavailability(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = setWindow.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("unavailability_windows")
    .insert({ user_id: user.id, ...parsed.data })
    .select("id")
    .single();
  if (error || !data) return err("db_error", error?.message ?? "unknown");
  revalidatePath("/settings");
  return ok({ id: data.id });
}

export async function clearUnavailability(
  id: string,
): Promise<ActionResult<null>> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("unavailability_windows")
    .delete()
    .eq("id", id);
  if (error) return err("db_error", error.message);
  revalidatePath("/settings");
  return ok(null);
}
