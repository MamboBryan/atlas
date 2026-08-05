import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarUserIcon, MeetingRoomIcon } from "@hugeicons/core-free-icons";
import { requireUser } from "@/lib/auth/require";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SeriesForm } from "@/components/series/series-form";
import type { AgendaTemplateItem } from "@/lib/zod/series";
import { DetailWithRail } from "@/components/app/detail-with-rail";

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
  const isAdmin = !!me && me.is_active && me.role === "admin";
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
          Array.from(new Set([...series.rotation_order, series.owner_user_id])),
        ),
    ]);

  const upcoming = (upcomingRows ?? []) as MeetingRow[];
  const rosterList = (roster ?? []) as { id: string; display_name: string }[];
  const nameById = new Map(
    ((owners ?? []) as { id: string; display_name: string }[]).map((r) => [
      r.id,
      r.display_name,
    ]),
  );

  const nextInRotation =
    series.rotation_order[
      series.rotation_cursor % series.rotation_order.length
    ];

  const cadenceLabel = (() => {
    const upper = series.rrule.toUpperCase();
    if (upper.includes("FREQ=WEEKLY")) return "weekly";
    if (upper.includes("FREQ=DAILY")) return "daily";
    if (upper.includes("FREQ=MONTHLY")) return "monthly";
    return "custom";
  })();

  const nextOccurrence = upcoming.length > 0 ? upcoming[0] : null;

  return (
    <DetailWithRail>
      <div className="space-y-8 max-w-3xl">
        {/* Back link */}
        <div className="flex items-center gap-2">
          <Link
            href={"/series" as never}
            className="text-sm text-ink-soft hover:text-ink transition-colors"
          >
            ← All series
          </Link>
        </div>

        {/* Header */}
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-extrabold text-ink">
            {series.name}
          </h1>
          {series.description && (
            <p className="text-sm text-ink-soft">{series.description}</p>
          )}

          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{cadenceLabel}</Badge>
            <span className="text-sm text-ink-soft">
              {series.rotation_order.length} members
            </span>
            {nextOccurrence && (
              <span className="text-sm text-ink-soft">
                Next: {fmtWhen(nextOccurrence.scheduled_start, series.timezone)}
              </span>
            )}
          </div>
        </div>

        {/* Members grid */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-ink-soft uppercase tracking-wide">
            Rotation
          </h2>
          {series.rotation_order.length === 0 ? (
            <EmptyState
              icon={CalendarUserIcon}
              headline="No members in rotation"
              body="Add members via the edit panel below."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {series.rotation_order.map((uid) => {
                const isNext = uid === nextInRotation;
                const name = nameById.get(uid) ?? uid.slice(0, 8);
                return (
                  <Card key={uid} size="sm">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-ink/10 flex-shrink-0" />
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">
                              {name}
                            </CardTitle>
                            {isNext && (
                              <CardDescription className="text-xs">
                                Next host
                              </CardDescription>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Upcoming meetings */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-ink-soft uppercase tracking-wide">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={MeetingRoomIcon}
              headline="No upcoming meetings"
              body="The cron generates the next 14 days each run."
            />
          ) : (
            <div className="space-y-2">
              {upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}` as never}
                  className="block no-underline"
                >
                  <Card interactive size="sm">
                    <CardHeader>
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <CardDescription className="flex flex-wrap gap-2">
                        <span>
                          {fmtWhen(m.scheduled_start, series.timezone)}
                        </span>
                        <span>·</span>
                        <span>
                          {m.host_user_id
                            ? `host ${nameById.get(m.host_user_id) ?? "?"}`
                            : "no host"}
                        </span>
                        <span>·</span>
                        <Badge variant="secondary" className="text-xs">
                          {m.status}
                        </Badge>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {canEdit && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-ink-soft uppercase tracking-wide">
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
    </DetailWithRail>
  );
}
