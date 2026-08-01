import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MeetingRoomIcon,
  Quiz02Icon,
  Calendar03Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { requireUser } from "@/lib/auth/require";

type UnavailableRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  user_id: string;
  profiles: { display_name: string } | null;
};

type Meeting = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  scheduled_start: string;
  timezone: string;
  host_user_id: string | null;
};

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtWhen(iso: string, viewerTz: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: viewerTz,
  });
}

export default async function HomeRight() {
  const { user, supabase } = await requireUser();
  const todayIso = new Date().toISOString().slice(0, 10);
  const viewerTz = "UTC";

  const [
    { data: unavail },
    { data: meetingRows },
    { data: promptRows },
    { data: myParticipation },
  ] = await Promise.all([
    supabase
      .from("unavailability_windows")
      .select("id,starts_on,ends_on,note,user_id,profiles(display_name)")
      .lte("starts_on", todayIso)
      .gte("ends_on", todayIso)
      .order("ends_on", { ascending: true }),
    supabase
      .from("meetings")
      .select("id,title,status,scheduled_start,timezone,host_user_id")
      .in("status", ["scheduled", "live"])
      .order("scheduled_start", { ascending: true })
      .limit(1),
    supabase
      .from("prompts")
      .select(
        "id,question,response_type,anonymity,meeting_id,owner_user_id,timing,is_open,is_revealed,opens_at,created_at",
      )
      .eq("timing", "async")
      .eq("is_open", true)
      .eq("is_revealed", false)
      .neq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("participation").select("prompt_id").eq("user_id", user.id),
  ]);

  const unavailable = (unavail ?? []) as unknown as UnavailableRow[];
  const nextMeeting = ((meetingRows ?? [])[0] as Meeting | undefined) ?? null;

  const answered = new Set(
    ((myParticipation ?? []) as { prompt_id: string }[]).map(
      (r) => r.prompt_id,
    ),
  );
  const nowIso = new Date().toISOString();
  const awaiting = (
    (promptRows ?? []) as {
      id: string;
      question: string;
      opens_at: string | null;
    }[]
  ).filter(
    (p) =>
      (!p.opens_at || new Date(p.opens_at).toISOString() <= nowIso) &&
      !answered.has(p.id),
  );

  return (
    <div className="space-y-8">
      {/* Picker */}
      <section className="sticky top-0 z-10 -mx-6 bg-surface px-6 pt-2 pb-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Target02Icon}
            size={16}
            strokeWidth={2}
            className="text-ink-soft shrink-0"
          />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Picker
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="accent"
            className="flex-1"
            render={<Link href="/tools/pick" />}
          >
            Pick someone
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            render={<Link href="/tools/shuffle" />}
          >
            Shuffle
          </Button>
        </div>
      </section>

      {/* Availability */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Calendar03Icon}
            size={16}
            strokeWidth={2}
            className="text-ink-soft shrink-0"
          />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Availability
          </h2>
        </div>
        {unavailable.length === 0 ? (
          <Card size="sm">
            <CardContent className="!py-4 text-center text-sm text-ink-soft">
              Everyone&apos;s available today.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {unavailable.map((u) => (
              <Card key={u.id} size="sm">
                <CardContent className="!py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {u.profiles?.display_name ?? "Unknown"}
                    </div>
                    {u.note && (
                      <div className="truncate text-xs text-ink-soft">
                        {u.note}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-ink-soft">
                    {fmtDay(u.starts_on)} → {fmtDay(u.ends_on)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Meetings */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={MeetingRoomIcon}
            size={16}
            strokeWidth={2}
            className="text-ink-soft shrink-0"
          />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Meetings
          </h2>
        </div>
        {nextMeeting ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                <Link
                  href={`/meetings/${nextMeeting.id}` as never}
                  className="hover:underline"
                >
                  {nextMeeting.title}
                </Link>
              </CardTitle>
              <CardDescription>
                {fmtWhen(nextMeeting.scheduled_start, viewerTz)}
              </CardDescription>
              <CardAction>
                {nextMeeting.status === "live" ? (
                  <LiveBadge size="lg" />
                ) : (
                  <Badge variant="scheduled" size="lg">
                    Scheduled
                  </Badge>
                )}
              </CardAction>
            </CardHeader>
          </Card>
        ) : (
          <EmptyState
            icon={MeetingRoomIcon}
            headline="No meetings on the horizon"
            body="You're safe, but only for now."
          />
        )}
      </section>

      {/* Polls */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Quiz02Icon}
            size={16}
            strokeWidth={2}
            className="text-ink-soft shrink-0"
          />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Polls
          </h2>
          {awaiting.length > 0 && (
            <Badge variant="open">{awaiting.length}</Badge>
          )}
        </div>
        {awaiting.length === 0 ? (
          <EmptyState
            sticker="speech-bubble"
            headline="All caught up"
            body="No polls waiting on your response."
          />
        ) : (
          <div className="space-y-2">
            {awaiting.map((p) => (
              <Card key={p.id} size="sm" interactive>
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={`/polls/${p.id}` as never}
                      className="hover:underline"
                    >
                      {p.question}
                    </Link>
                  </CardTitle>
                  <CardAction>
                    <Badge variant="open">Open</Badge>
                  </CardAction>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
