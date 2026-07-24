"use server";
import { revalidatePath } from "next/cache";
import { profileUpdate } from "@/lib/zod/profile";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireUser } from "@/lib/auth/require";

export async function updateProfile(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = profileUpdate.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);
  if (error) return err("db_error", error.message);
  revalidatePath("/settings");
  return ok(null);
}
