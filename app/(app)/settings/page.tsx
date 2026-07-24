import { requireUser } from "@/lib/auth/require";
import { SettingsForm } from "@/components/app/settings-form";
import { UnavailabilityEditor } from "@/components/app/unavailability-editor";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_url,email")
    .eq("id", user.id)
    .single();
  const { data: windows } = await supabase
    .from("unavailability_windows")
    .select("id,starts_on,ends_on,note")
    .eq("user_id", user.id)
    .order("starts_on", { ascending: false });

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-medium">Profile</h2>
        <SettingsForm
          displayName={profile?.display_name ?? ""}
          avatarUrl={profile?.avatar_url ?? null}
        />
      </section>
      <Separator />
      <section className="space-y-3">
        <h2 className="font-medium">Unavailability</h2>
        <p className="text-sm text-muted-foreground">
          Days you cannot be picked as host. Admins can see these.
        </p>
        <UnavailabilityEditor windows={windows ?? []} />
      </section>
    </div>
  );
}
