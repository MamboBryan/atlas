import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("unauthenticated", "sign in required");
  return { user, supabase };
}

export async function requireAdmin() {
  const ctx = await requireUser();
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", ctx.user.id)
    .single();
  if (error || !data || data.role !== "admin" || !data.is_active)
    throw new AuthError("forbidden", "admin required");
  return ctx;
}
