import { requireUser } from "@/lib/auth/require";
import { RosterGrid } from "@/components/app/roster-grid";
import { DetailWithRail } from "@/components/app/detail-with-rail";

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
    <DetailWithRail>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Roster</h1>
        <RosterGrid
          rows={data ?? []}
          isAdmin={mine?.role === "admin"}
          currentUserId={user.id}
        />
      </div>
    </DetailWithRail>
  );
}
