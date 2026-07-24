import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { SeriesForm } from "@/components/series/series-form";

export default async function NewSeriesPage() {
  const { user, supabase } = await requireUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!me || me.role !== "admin" || !me.is_active) redirect("/series" as never);

  const { data: roster } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New series</h1>
      <SeriesForm
        roster={
          (roster ?? []) as { id: string; display_name: string }[]
        }
        mode={{ kind: "create" }}
      />
    </div>
  );
}
