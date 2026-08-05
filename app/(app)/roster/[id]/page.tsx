import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sticker } from "@/components/ui/sticker";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailWithRail } from "@/components/app/detail-with-rail";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,email,avatar_url,role,is_active,created_at")
    .eq("id", id)
    .single();
  if (!data) notFound();

  // Activity: last 5 meetings hosted by this member — cheaply available
  const { data: hostedMeetings } = await supabase
    .from("meetings")
    .select("id,title,scheduled_start,status")
    .eq("host_user_id", id)
    .in("status", ["ended", "live"])
    .order("scheduled_start", { ascending: false })
    .limit(5);

  const meetings = hostedMeetings ?? [];
  // Streak = consecutive past meetings hosted (simple count as proxy)
  const streak = meetings.length;

  const initials = data.display_name.slice(0, 2).toUpperCase();
  const joinedYear = new Date(data.created_at).getFullYear();

  return (
    <DetailWithRail>
      <div className="space-y-6">
        {/* Profile card */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <div className="grid size-24 shrink-0 place-items-center rounded-full bg-accent text-accent-ink font-display font-extrabold text-3xl">
                {data.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.avatar_url}
                    alt=""
                    className="size-24 rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-extrabold text-ink">
                  {data.display_name}
                </h1>
                <p className="text-sm text-ink-soft">{data.email}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={data.role === "admin" ? "open" : "scheduled"}>
                    {data.role}
                  </Badge>
                  {data.is_active ? (
                    <Badge variant="live">active</Badge>
                  ) : (
                    <Badge variant="ended">inactive</Badge>
                  )}
                  <Badge variant="ghost">joined {joinedYear}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity strip */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-extrabold text-ink">
              Activity
            </h2>
            {streak >= 5 && (
              <span className="flex items-center gap-1 text-sm text-ink-soft">
                <Sticker name="thumbs-up" size="sm" />
                {streak} hosted
              </span>
            )}
          </div>

          {meetings.length === 0 ? (
            <EmptyState
              sticker="calendar"
              headline="No activity yet"
              body="Meetings this member hosts will appear here."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {meetings.map((m) => (
                <Card key={m.id} size="sm">
                  <CardHeader>
                    <CardTitle className="text-sm">{m.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-ink-soft">
                      {new Date(m.scheduled_start).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </p>
                    <Badge
                      variant={m.status === "live" ? "live" : "ended"}
                      className="mt-2"
                    >
                      {m.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailWithRail>
  );
}
