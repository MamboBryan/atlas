import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveMeetingParticipants(
  svc: SupabaseClient,
  meeting: { participants_override: string[] | null },
): Promise<string[]> {
  if (meeting.participants_override && meeting.participants_override.length > 0)
    return meeting.participants_override;
  const { data } = await svc
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}

export async function resolveAllActiveUserIds(
  svc: SupabaseClient,
): Promise<string[]> {
  const { data } = await svc
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}
