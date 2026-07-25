import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge, LiveBadge } from "@/components/ui/badge";
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
  if (status === "live") return <LiveBadge />;
  if (status === "scheduled") return <Badge variant="scheduled">Scheduled</Badge>;
  if (status === "ended") return <Badge variant="ended">Ended</Badge>;
  if (status === "postponed") return <Badge variant="postponed">Postponed</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
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
      <Card interactive size="sm">
        <CardHeader>
          <CardTitle className="truncate">{m.title}</CardTitle>
          <CardDescription>
            {fmtWhen(m.scheduled_start, m.timezone, viewerTz)}
            {" · "}host {host}
            {" · "}{participantCount} participants
          </CardDescription>
          <CardAction>
            <StatusBadge status={m.status} />
          </CardAction>
        </CardHeader>
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
    <div className="space-y-8 max-w-3xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">Meetings</h1>
          <p className="text-sm text-ink-soft">Upcoming rituals for your team.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={"/meetings/past" as never}
            className="inline-flex h-10 items-center rounded-md border border-ink bg-surface-raised px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            Past
          </Link>
          <NewMeetingTrigger defaultTimezone={viewerTz} />
        </div>
      </header>

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
          <p className="text-sm text-ink-soft">No past meetings yet.</p>
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
