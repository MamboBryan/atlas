import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";
import { MeetingRoomIcon } from "@hugeicons/core-free-icons";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { DetailWithRail } from "@/components/app/detail-with-rail";

type MeetingRow = {
  id: string;
  title: string;
  status: "ended" | "postponed" | "cancelled";
  scheduled_start: string;
  started_at: string | null;
  timezone: string;
  host_user_id: string | null;
  participants_override: string[] | null;
};

type HostRow = { id: string; display_name: string };

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

function StatusBadge({ status }: { status: MeetingRow["status"] }) {
  if (status === "ended") return <Badge variant="ended">Ended</Badge>;
  if (status === "postponed")
    return <Badge variant="postponed">Postponed</Badge>;
  return <Badge variant="destructive">Cancelled</Badge>;
}

export default async function PastMeetingsPage() {
  const { supabase } = await requireUser();

  const { data: rows } = await supabase
    .from("meetings")
    .select(
      "id,title,status,scheduled_start,started_at,timezone,host_user_id,participants_override",
    )
    .in("status", ["ended", "postponed", "cancelled"])
    .not("started_at", "is", null)
    .order("started_at", { ascending: false });

  const meetings = (rows ?? []) as MeetingRow[];

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

  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <DetailWithRail>
      <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={"/meetings" as never}
          className="text-ink-soft hover:text-ink transition-colors"
        >
          ← Meetings
        </Link>
      </div>

      {/* Page header */}
      <h1 className="font-display text-3xl font-extrabold text-ink">
        Past meetings
      </h1>

      {meetings.length === 0 ? (
        <EmptyState
          icon={MeetingRoomIcon}
          headline="No past meetings yet"
          body="Meetings that have ended or been postponed will appear here."
        />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const host = m.host_user_id
              ? (nameById.get(m.host_user_id) ?? "?")
              : "?";
            const pc = m.participants_override
              ? m.participants_override.length
              : activeCount;
            return (
              <Link
                key={m.id}
                href={`/meetings/${m.id}` as never}
                className="block"
              >
                <Card interactive>
                  <CardHeader>
                    <CardTitle className="truncate">{m.title}</CardTitle>
                    <CardDescription className="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {fmtWhen(
                          m.started_at ?? m.scheduled_start,
                          m.timezone,
                          viewerTz,
                        )}
                      </span>
                      <span>·</span>
                      <span>host {host}</span>
                      <span>·</span>
                      <span>{pc} participants</span>
                    </CardDescription>
                    <CardAction>
                      <StatusBadge status={m.status} />
                    </CardAction>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </DetailWithRail>
  );
}
