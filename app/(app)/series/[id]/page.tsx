import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { Badge } from "@/components/ui/badge";
import { SeriesForm } from "@/components/series/series-form";
import type { AgendaTemplateItem } from "@/lib/zod/series";

type SeriesRow = {
  id: string;
  name: string;
  description: string | null;
  rrule: string;
  timezone: string;
  rotation_order: string[];
  rotation_cursor: number;
  default_participant_ids: string[] | null;
  agenda_template: AgendaTemplateItem[];
  owner_user_id: string;
  created_by: string;
};

type MeetingRow = {
  id: string;
  title: string;
  scheduled_start: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  host_user_id: string | null;
};

function fmtWhen(iso: string, tz: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  });
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: seriesRow } = await supabase
    .from("meeting_series")
    .select(
      "id,name,description,rrule,timezone,rotation_order,rotation_cursor,default_participant_ids,agenda_template,owner_user_id,created_by",
    )
    .eq("id", id)
    .single();
  if (!seriesRow) notFound();
  const series = seriesRow as SeriesRow;

  const { data: me } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  const isAdmin =
    !!me && me.is_active && me.role === "admin";
  const isOwner = series.owner_user_id === user.id;
  const canEdit = isAdmin || isOwner;

  const [{ data: upcomingRows }, { data: roster }, { data: owners }] =
    await Promise.all([
      supabase
        .from("meetings")
        .select("id,title,scheduled_start,status,host_user_id")
        .eq("series_id", id)
        .gte("scheduled_start", new Date().toISOString())
        .order("scheduled_start", { ascending: true })
        .limit(20),
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,display_name")
        .in(
          "id",
          Array.from(
            new Set([...series.rotation_order, series.owner_user_id]),
          ),
        ),
    ]);

  const upcoming = (upcomingRows ?? []) as MeetingRow[];
  const rosterList =
    (roster ?? []) as { id: string; display_name: string }[];
  const nameById = new Map(
    ((owners ?? []) as { id: string; display_name: string }[]).map((r) => [
      r.id,
      r.display_name,
    ]),
  );

  const nextInRotation =
    series.rotation_order[series.rotation_cursor % series.rotation_order.length];

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Link
            href={"/series" as never}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All series
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">{series.name}</h1>
        {series.description && (
          <p className="text-sm text-muted-foreground">{series.description}</p>
        )}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
          <span>{series.timezone}</span>
          <span>·</span>
          <code>{series.rrule}</code>
          <span>·</span>
          <span>owner {nameById.get(series.owner_user_id) ?? "?"}</span>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Rotation ({series.rotation_order.length})
        </h2>
        <ol className="rounded-md border divide-y">
          {series.rotation_order.map((uid, i) => {
            const isNext = uid === nextInRotation;
            return (
              <li
                key={uid}
                className="flex items-center justify-between gap-2 p-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  {nameById.get(uid) ?? uid.slice(0, 8)}
                </span>
                {isNext && <Badge>next</Badge>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Upcoming generated meetings ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. The cron generates the next 14 days each run.
          </p>
        ) : (
          <ul className="rounded-md border divide-y">
            {upcoming.map((m) => (
              <li key={m.id} className="p-2 text-sm">
                <Link
                  href={`/meetings/${m.id}` as never}
                  className="flex items-center justify-between gap-2 hover:underline"
                >
                  <span className="truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtWhen(m.scheduled_start, series.timezone)} ·{" "}
                    {m.host_user_id
                      ? `host ${nameById.get(m.host_user_id) ?? "?"}`
                      : "no host"}{" "}
                    · {m.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Edit
          </h2>
          <SeriesForm
            roster={rosterList}
            mode={{
              kind: "edit",
              id: series.id,
              initial: {
                name: series.name,
                description: series.description,
                rrule: series.rrule,
                timezone: series.timezone,
                rotation_order: series.rotation_order,
                default_participant_ids: series.default_participant_ids,
                agenda_template: series.agenda_template ?? [],
              },
            }}
          />
        </section>
      )}
    </div>
  );
}
