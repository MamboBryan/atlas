import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";

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
  if (status === "live") return <Badge>Live</Badge>;
  if (status === "scheduled") return <Badge variant="outline">Scheduled</Badge>;
  if (status === "ended") return <Badge variant="secondary">Ended</Badge>;
  if (status === "postponed")
    return <Badge variant="outline">Postponed</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
}

function Row({
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
    <Link
      href={`/meetings/${m.id}` as never}
      className="block rounded-lg border p-4 hover:bg-muted transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{m.title}</div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
            <span>{fmtWhen(m.scheduled_start, m.timezone, viewerTz)}</span>
            <span>·</span>
            <span>host {host}</span>
            <span>·</span>
            <span>{participantCount} participants</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-wrap gap-1.5 justify-end">
          <StatusBadge status={m.status} />
        </div>
      </div>
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

  const viewerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <div className="flex items-center gap-2">
          <Link
            href={"/meetings/past" as never}
            className={buttonVariants({ variant: "outline" })}
          >
            Past
          </Link>
          <Link href={"/meetings/new" as never} className={buttonVariants()}>
            New meeting
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing live.</p>
        ) : (
          <div className="space-y-2">
            {live.map((m) => (
              <Row
                key={m.id}
                m={m}
                host={
                  m.host_user_id ? nameById.get(m.host_user_id) ?? "?" : "?"
                }
                viewerTz={viewerTz}
                participantCount={pc(m)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming meetings.
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((m) => (
              <Row
                key={m.id}
                m={m}
                host={
                  m.host_user_id ? nameById.get(m.host_user_id) ?? "?" : "?"
                }
                viewerTz={viewerTz}
                participantCount={pc(m)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Past ({past.length})
        </h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past meetings.</p>
        ) : (
          <div className="space-y-2">
            {past.map((m) => (
              <Row
                key={m.id}
                m={m}
                host={
                  m.host_user_id ? nameById.get(m.host_user_id) ?? "?" : "?"
                }
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
