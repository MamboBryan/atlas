import { requireUser } from "@/lib/auth/require";
import { SettingsForm } from "@/components/app/settings-form";
import { UnavailabilityEditor } from "@/components/app/unavailability-editor";
import { EmailPrefsForm } from "@/components/app/email-prefs-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DangerZone } from "@/components/app/danger-zone";

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_url,email,email_prefs")
    .eq("id", user.id)
    .single();
  const { data: windows } = await supabase
    .from("unavailability_windows")
    .select("id,starts_on,ends_on,note")
    .eq("user_id", user.id)
    .order("starts_on", { ascending: false });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            displayName={profile?.display_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which emails you want to receive. In-app notifications are
            always shown.
          </p>
          <EmailPrefsForm
            displayName={profile?.display_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
            emailPrefs={(profile?.email_prefs as Record<string, boolean>) ?? {}}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unavailability</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Days you cannot be picked as host. Admins can see these.
          </p>
          <UnavailabilityEditor windows={windows ?? []} />
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}
