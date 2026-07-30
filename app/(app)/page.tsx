import Link from "next/link";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { MeetingRoomIcon } from "@hugeicons/core-free-icons";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/require";
import { NextMeetingActions } from "@/components/app/next-meeting-actions";
import { AccountsCard } from "@/components/thamani/accounts-card";
import { getAccountsCurrent, getAccountsMonthly } from "@/lib/thamani/read";

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
  if (status === "live") return <LiveBadge size="lg" />;
  return (
    <Badge variant="scheduled" size="lg">
      Scheduled
    </Badge>
  );
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

  const metricsNow = new Date();
  const metricsYear = metricsNow.getUTCFullYear();
  const [accountsCurrent, accountsMonthly] = await Promise.all([
    getAccountsCurrent(supabase, metricsNow),
    getAccountsMonthly(supabase, metricsYear),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">Home</h1>
          <p className="text-sm text-ink-soft">What&apos;s on your plate today.</p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Product growth
        </h2>
        <AccountsCard current={accountsCurrent} monthly={accountsMonthly} year={metricsYear} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
          Your next meeting
        </h2>
        {nextMeeting ? (
          <Card className="px-1">
            <CardHeader>
              <CardTitle>
                <Link href={`/meetings/${nextMeeting.id}` as never} className="hover:underline">
                  {nextMeeting.title}
                </Link>
              </CardTitle>
              <CardDescription>
                {fmtWhen(nextMeeting.scheduled_start, nextMeeting.timezone, viewerTz)}{" "}
                · host {hostRow?.display_name ?? "?"}
              </CardDescription>
              <CardAction>
                <StatusBadge status={nextMeeting.status} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 pt-2">
              {canStart && <NextMeetingActions meetingId={nextMeeting.id} />}
              <Button
                variant="outline"
                render={<Link href={`/meetings/${nextMeeting.id}` as never} />}
              >
                {canStart ? "Postpone or view" : "Open"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={MeetingRoomIcon}
            headline="No meetings on the horizon"
            body="You're safe, but only for now."
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Awaiting your response
          </h2>
          {awaiting.length > 0 && <Badge variant="open">{awaiting.length}</Badge>}
        </div>
        {awaiting.length === 0 ? (
          <EmptyState sticker="speech-bubble" headline="All caught up" body="No polls waiting on your response." />
        ) : (
          <div className="space-y-3">
            {awaiting.map((p) => (
              <Card key={p.id} interactive>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/polls/${p.id}` as never} className="hover:underline">
                      {p.question}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {p.response_type.replace("_", " ")} · {p.anonymity}
                    {p.meeting_id ? " · in meeting" : ""}
                  </CardDescription>
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
