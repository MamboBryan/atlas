import { requireUser } from "@/lib/auth/require";
import { MeetingForm } from "@/components/meetings/meeting-form";

export default async function NewMeetingPage() {
  const { supabase } = await requireUser();
  const { data: roster } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New meeting</h1>
      <MeetingForm roster={(roster ?? []) as { id: string; display_name: string }[]} />
    </div>
  );
}
