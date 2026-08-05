import { createSupabaseServerClient } from "@/lib/supabase/server";
import { atlasServiceClient } from "@/lib/supabase/service";

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

/**
 * Gate an evaluation-management action to the evaluation's owners. Only owners
 * (the original creator plus anyone they promote) may edit or close it — being
 * an admin is not sufficient. Checked via the service client so it holds
 * regardless of the caller's RLS visibility.
 */
export async function requireEvaluationOwner(evaluationId: string) {
  const ctx = await requireUser();
  const { data, error } = await atlasServiceClient()
    .from("evaluation_owners")
    .select("profile_id")
    .eq("evaluation_id", evaluationId)
    .eq("profile_id", ctx.user.id)
    .maybeSingle();
  if (error || !data)
    throw new AuthError("forbidden", "evaluation owner required");
  return ctx;
}
