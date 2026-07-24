import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";
import { NextMeetingActions } from "@/components/app/next-meeting-actions";

type Meeting = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  scheduled_start: string;
  timezone: string;
  host_user_id: string | null;
};

type Prompt = {
  id: string;
  question: string;
  response_type: string;
  anonymity: string;
  meeting_id: string | null;
  owner_user_id: string;
};

const GRACE_MIN = 5;

function fmtWhen(iso: string, tz: string, viewerTz: string) {
  const d = new Date(iso);
  const local = d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: viewerTz,
  });
  if (tz === viewerTz) return local;
  const source = d.toLocaleString(undefined, {
    timeStyle: "short",
    timeZone: tz,
  });
  return `${local} (${source} ${tz})`;
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  if (status === "live") return <Badge>Live</Badge>;
  return <Badge variant="outline">Scheduled</Badge>;
}

export default async function HomePage() {
  const { user, supabase } = await requireUser();

  const nowIso = new Date().toISOString();

  const { data: meetingRows } = await supabase
    .from("meetings")
    .select(
      "id,title,status,scheduled_start,timezone,host_user_id",
    )
    .in("status", ["scheduled", "live"])
    .order("scheduled_start", { ascending: true })
    .limit(1);

  const nextMeeting = ((meetingRows ?? [])[0] as Meeting | undefined) ?? null;

  const [{ data: hostRow }, { data: promptRows }, { data: myParticipation }] =
    await Promise.all([
      nextMeeting?.host_user_id
        ? supabase
            .from("profiles")
            .select("display_name")
            .eq("id", nextMeeting.host_user_id)
            .single()
        : Promise.resolve({ data: null }),
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

  const answered = new Set(
    ((myParticipation ?? []) as { prompt_id: string }[]).map(
      (r) => r.prompt_id,
    ),
  );

  const promptsAll = (promptRows ?? []) as (Prompt & {
    opens_at: string | null;
  })[];
  const openedOrNoWindow = promptsAll.filter((p) => {
    if (!p.opens_at) return true;
    return new Date(p.opens_at).toISOString() <= nowIso;
  });
  const awaiting = openedOrNoWindow.filter((p) => !answered.has(p.id));

  const viewerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const inStartWindow = (() => {
    if (!nextMeeting) return false;
    const scheduled = new Date(nextMeeting.scheduled_start).getTime();
    const now = Date.now();
    return Math.abs(scheduled - now) <= GRACE_MIN * 60 * 1000;
  })();
  const canStart =
    !!nextMeeting &&
    nextMeeting.status === "scheduled" &&
    nextMeeting.host_user_id === user.id &&
    inStartWindow;

  return (
    <main className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Home</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Your next meeting
        </h2>
        {nextMeeting ? (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/meetings/${nextMeeting.id}` as never}
                  className="font-medium hover:underline"
                >
                  {nextMeeting.title}
                </Link>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                  <span>
                    {fmtWhen(
                      nextMeeting.scheduled_start,
                      nextMeeting.timezone,
                      viewerTz,
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    host {hostRow?.display_name ?? "?"}
                  </span>
                </div>
              </div>
              <StatusBadge status={nextMeeting.status} />
            </div>
            <div className="flex items-center gap-2">
              {canStart && <NextMeetingActions meetingId={nextMeeting.id} />}
              <Link
                href={`/meetings/${nextMeeting.id}` as never}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {canStart ? "Postpone or view" : "Open"}
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No upcoming meetings.{" "}
            <Link
              href={"/meetings/new" as never}
              className="underline hover:text-foreground"
            >
              Schedule one
            </Link>
            .
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Awaiting your response ({awaiting.length})
        </h2>
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting on you.
          </p>
        ) : (
          <div className="space-y-2">
            {awaiting.map((p) => (
              <Link
                key={p.id}
                href={`/polls/${p.id}` as never}
                className="block rounded-lg border p-4 hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.question}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                      <span>{p.response_type.replace("_", " ")}</span>
                      <span>·</span>
                      <span>{p.anonymity}</span>
                      {p.meeting_id && (
                        <>
                          <span>·</span>
                          <span>in meeting</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge>Open</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Quick tools
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={"/tools/pick" as never}
            className={buttonVariants({ variant: "default" })}
          >
            Pick someone
          </Link>
          <Link
            href={"/tools/shuffle" as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Shuffle roster
          </Link>
        </div>
      </section>
    </main>
  );
}
