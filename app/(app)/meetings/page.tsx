import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChessKingIcon, MeetingRoomIcon } from "@hugeicons/core-free-icons";
import { MeetingsTabs } from "@/components/app/meetings-tabs";
import { NewMeetingTrigger } from "./_ui/new-meeting-trigger";

type MeetingRow = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  scheduled_start: string;
  timezone: string;
  host_user_id: string | null;
  created_by: string;
  participants_override: string[] | null;
};

type HostRow = { id: string; display_name: string };

function fmtWhen(iso: string, tz: string, viewerTz: string) {
  const d = new Date(iso);
  const same = tz === viewerTz;
  const local = d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: viewerTz,
  });
  if (same) return local;
  const source = d.toLocaleString(undefined, {
    timeStyle: "short",
    timeZone: tz,
  });
  return `${local} (${source} ${tz})`;
}

function StatusBadge({ status }: { status: MeetingRow["status"] }) {
  if (status === "live") return <LiveBadge size="lg" />;
  if (status === "scheduled") return <Badge variant="scheduled" size="lg">Scheduled</Badge>;
  if (status === "ended") return <Badge variant="ended" size="lg">Ended</Badge>;
  if (status === "postponed") return <Badge variant="postponed" size="lg">Postponed</Badge>;
  return <Badge variant="outline" size="lg">Cancelled</Badge>;
}

function MeetingCard({
  m,
  host,
  viewerTz,
  participantCount,
}: {
  m: MeetingRow;
  host: string;
  viewerTz: string;
  participantCount: number;
}) {
  return (
    <Link href={`/meetings/${m.id}` as never} className="block no-underline">
      <Card interactive>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {fmtWhen(m.scheduled_start, m.timezone, viewerTz)}
            </p>
            <StatusBadge status={m.status} />
          </div>
          <h3 className="font-display text-xl font-extrabold text-ink truncate">
            {m.title}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-ink-soft">
            <HugeiconsIcon
              icon={ChessKingIcon}
              size={16}
              strokeWidth={2}
              className="shrink-0"
            />
            <span className="capitalize">{host}</span>
            <span aria-hidden>·</span>
            <span>{participantCount} participants</span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function MeetingsPage() {
  const { supabase } = await requireUser();

  const { data: all } = await supabase
    .from("meetings")
    .select(
      "id,title,status,scheduled_start,timezone,host_user_id,created_by,participants_override",
    )
    .order("scheduled_start", { ascending: true });

  const meetings = (all ?? []) as MeetingRow[];

  const hostIds = Array.from(
    new Set(
      meetings
        .map((m) => m.host_user_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  );

  const { data: hostRows } = hostIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", hostIds)
    : { data: [] as HostRow[] };

  const nameById = new Map<string, string>(
    ((hostRows ?? []) as HostRow[]).map((r) => [r.id, r.display_name]),
  );

  const { data: roster } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  const activeCount = (roster ?? []).length;

  function pc(m: MeetingRow) {
    if (m.participants_override && Array.isArray(m.participants_override))
      return m.participants_override.length;
    return activeCount;
  }

  const live = meetings.filter((m) => m.status === "live");
  const upcoming = meetings.filter(
    (m) => m.status === "scheduled" || m.status === "postponed",
  );
  const past = meetings.filter(
    (m) => m.status === "ended" || m.status === "cancelled",
  );

  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">Meetings</h1>
          <p className="text-sm text-ink-soft">Upcoming rituals for your team.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" render={<Link href={"/meetings/past" as never} />}>
            Past
          </Button>
          <NewMeetingTrigger defaultTimezone={viewerTz} />
        </div>
      </header>

      <MeetingsTabs />

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Live now ({live.length})
          </h2>
          <div className="space-y-2">
            {live.map((m) => (
              <MeetingCard
                key={m.id}
                m={m}
                host={m.host_user_id ? (nameById.get(m.host_user_id) ?? "?") : "?"}
                viewerTz={viewerTz}
                participantCount={pc(m)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-soft">No upcoming meetings. Schedule one!</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((m) => (
              <MeetingCard
                key={m.id}
                m={m}
                host={m.host_user_id ? (nameById.get(m.host_user_id) ?? "?") : "?"}
                viewerTz={viewerTz}
                participantCount={pc(m)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Recent past ({past.length})
        </h2>
        {past.length === 0 ? (
          <EmptyState icon={MeetingRoomIcon} headline="No past meetings yet" body="Completed meetings will show up here." />
        ) : (
          <div className="space-y-2">
            {past.map((m) => (
              <MeetingCard
                key={m.id}
                m={m}
                host={m.host_user_id ? (nameById.get(m.host_user_id) ?? "?") : "?"}
                viewerTz={viewerTz}
                participantCount={pc(m)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
