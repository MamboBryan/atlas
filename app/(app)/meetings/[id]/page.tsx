import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChessKingIcon } from "@hugeicons/core-free-icons";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";
import { MeetingLiveView } from "@/components/meetings/meeting-live-view";
import { MeetingHeaderActions } from "@/components/meetings/meeting-header-actions";
import { DelegateHostButton } from "@/components/meetings/delegate-host-button";
import {
  AgendaEditor,
  type AgendaItem,
  type PromptOption,
} from "@/components/meetings/agenda-editor";
import { GameLobbyPanel } from "@/components/games/game-lobby-panel";
import { DetailWithRail } from "@/components/app/detail-with-rail";
import { MeetingRail } from "@/components/meetings/meeting-rail";

type Meeting = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  scheduled_start: string;
  timezone: string;
  host_user_id: string | null;
  created_by: string;
  current_agenda_item_id: string | null;
  participants_override: string[] | null;
  series_id: string | null;
};

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
  if (status === "scheduled")
    return (
      <Badge variant="scheduled" size="lg">
        Scheduled
      </Badge>
    );
  if (status === "postponed")
    return (
      <Badge variant="postponed" size="lg">
        Postponed
      </Badge>
    );
  if (status === "ended")
    return (
      <Badge variant="ended" size="lg">
        Ended
      </Badge>
    );
  return (
    <Badge variant="destructive" size="lg">
      Cancelled
    </Badge>
  );
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select(
      "id,title,status,scheduled_start,timezone,host_user_id,created_by,current_agenda_item_id,participants_override,series_id",
    )
    .eq("id", id)
    .single();
  if (!meeting) notFound();

  const m = meeting as Meeting;

  const [
    { data: hostRow },
    { data: items },
    { data: seriesRow },
    { data: rosterRows },
  ] = await Promise.all([
    m.host_user_id
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", m.host_user_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("agenda_items")
      .select("id,ordinal,title,kind,prompt_id,picker_config,picker_result")
      .eq("meeting_id", id)
      .order("ordinal", { ascending: true }),
    m.series_id
      ? supabase
          .from("meeting_series")
          .select("id,name")
          .eq("id", m.series_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("profiles")
      .select("id,display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
  ]);

  const agendaItems = (items ?? []) as AgendaItem[];
  const roster = (rosterRows ?? []) as { id: string; display_name: string }[];

  const isHost = m.host_user_id === user.id;

  const { data: myPrompts } = isHost
    ? await supabase
        .from("prompts")
        .select("id,question,meeting_id")
        .eq("created_by", user.id)
        .is("meeting_id", null)
        .order("created_at", { ascending: false })
        .limit(50)
    : {
        data: [] as {
          id: string;
          question: string;
          meeting_id: string | null;
        }[],
      };

  const availablePrompts = (
    (myPrompts ?? []) as {
      id: string;
      question: string;
    }[]
  ).map((p) => ({ id: p.id, question: p.question })) as PromptOption[];

  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const participantCount = m.participants_override
    ? m.participants_override.length
    : null;

  return (
    <DetailWithRail rail={<MeetingRail id={id} />}>
      <div className="space-y-8">
        <header className="space-y-3">
          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-ink-soft"
          >
            <Link
              href={"/meetings" as never}
              className="hover:text-ink transition-colors"
            >
              Meetings
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink truncate">{m.title}</span>
          </nav>

          {/* Title + actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl font-extrabold text-ink leading-tight">
                  {m.title}
                </h1>
                <StatusBadge status={m.status} />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                <span>{fmtWhen(m.scheduled_start, m.timezone, viewerTz)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={ChessKingIcon}
                    size={16}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <span className="capitalize">
                    {hostRow?.display_name ?? "?"}
                  </span>
                </span>
                {participantCount !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{participantCount} participants</span>
                  </>
                )}
                {seriesRow && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      Series:{" "}
                      <Link
                        href={`/series/${seriesRow.id}` as never}
                        className="underline hover:text-ink"
                      >
                        {seriesRow.name}
                      </Link>
                    </span>
                  </>
                )}
              </p>
            </div>
            {isHost && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <MeetingHeaderActions
                  meetingId={m.id}
                  status={m.status}
                  scheduledStart={m.scheduled_start}
                  isHost={isHost}
                />
                {m.status !== "ended" && m.status !== "cancelled" && (
                  <DelegateHostButton
                    meetingId={m.id}
                    currentHostId={m.host_user_id}
                    roster={roster}
                  />
                )}
              </div>
            )}
          </div>
        </header>

        {m.status === "scheduled" && (
          <GameLobbyPanel
            meetingId={m.id}
            scheduledStart={m.scheduled_start}
            status={m.status}
          />
        )}

        {(m.status === "live" || m.status === "ended") && (
          <MeetingLiveView
            meetingId={m.id}
            scheduledStart={m.scheduled_start}
            initialMeeting={{
              id: m.id,
              status: m.status,
              current_agenda_item_id: m.current_agenda_item_id,
            }}
            initialItems={agendaItems}
            isHost={isHost}
          />
        )}

        {isHost && m.status !== "ended" && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-extrabold text-ink">
              Agenda
            </h2>
            <AgendaEditor
              meetingId={m.id}
              items={agendaItems}
              availablePrompts={availablePrompts}
            />
          </section>
        )}

        {!isHost && m.status === "scheduled" && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-extrabold text-ink">
              Agenda
            </h2>
            <AgendaEditor meetingId={m.id} items={agendaItems} readOnly />
          </section>
        )}
      </div>
    </DetailWithRail>
  );
}
