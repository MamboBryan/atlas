import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";

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
  if (status === "ended") return <Badge variant="secondary">Ended</Badge>;
  if (status === "postponed")
    return <Badge variant="outline">Postponed</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
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

  const viewerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={"/meetings" as never}
          className="text-muted-foreground hover:underline"
        >
          ← Meetings
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Past meetings</h1>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No meetings have taken place yet.
        </p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => {
            const host = m.host_user_id
              ? nameById.get(m.host_user_id) ?? "?"
              : "?";
            const pc = m.participants_override
              ? m.participants_override.length
              : activeCount;
            return (
              <Link
                key={m.id}
                href={`/meetings/${m.id}` as never}
                className="block rounded-lg border p-4 hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
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
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={m.status} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
