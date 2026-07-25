"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { addMember, setRole, deactivate } from "@/lib/zod/roster";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { requireAdmin } from "@/lib/auth/require";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function addMemberAction(
  input: unknown,
): Promise<ActionResult<{ user_id: string }>> {
  const parsed = addMember.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  await requireAdmin();
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { data: { full_name: parsed.data.display_name } },
  );
  if (error || !data.user)
    return err("invite_failed", error?.message ?? "unknown");
  revalidatePath("/roster");
  return ok({ user_id: data.user.id });
}

export async function setRoleAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = setRole.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.user_id);
  if (error) return err("db_error", error.message);
  revalidatePath("/roster");
  return ok(null);
}

export async function deactivateAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deactivate.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", parsed.data.user_id);
  if (error) return err("db_error", error.message);
  revalidatePath("/roster");
  return ok(null);
}
