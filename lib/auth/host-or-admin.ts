import type { requireUser } from "@/lib/auth/require";

/**
 * True when the user hosts the meeting or is an active atlas admin. Takes the
 * caller's Supabase client so it runs under whatever identity the caller
 * already established — do not swap this for a helper that builds its own.
 */
export async function isHostOrAdmin(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  hostUserId: string | null,
  userId: string,
): Promise<boolean> {
  if (hostUserId === userId) return true;
  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .single();
  return data?.role === "admin" && data?.is_active === true;
}
