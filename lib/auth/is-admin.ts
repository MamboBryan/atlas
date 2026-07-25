import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  return !!data && data.role === "admin" && data.is_active === true;
}
