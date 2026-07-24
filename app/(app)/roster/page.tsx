import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require";
import { RosterTable } from "@/components/app/roster-table";

export default async function RosterPage() {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,email,role,is_active")
    .order("display_name");
  const { data: mine } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Roster</h1>
      <RosterTable rows={data ?? []} isAdmin={mine?.role === "admin"} />
    </div>
  );
}
