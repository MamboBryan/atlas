"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";

export async function markNotificationRead(
  notification_id: string,
): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notification_id)
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return err("db_error", error.message);
  revalidatePath("/notifications");
  return ok(null);
}

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return err("db_error", error.message);
  revalidatePath("/notifications");
  return ok(null);
}
