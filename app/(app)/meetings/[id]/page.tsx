import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/require";
import { MeetingLiveView } from "@/components/meetings/meeting-live-view";
import {
  AgendaEditor,
  type AgendaItem,
  type PromptOption,
} from "@/components/meetings/agenda-editor";

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
      "id,title,status,scheduled_start,timezone,host_user_id,created_by,current_agenda_item_id,participants_override",
    )
    .eq("id", id)
    .single();
  if (!meeting) notFound();

  const m = meeting as Meeting;

  const [{ data: hostRow }, { data: items }] = await Promise.all([
    m.host_user_id
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", m.host_user_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("agenda_items")
      .select("id,ordinal,title,kind,prompt_id")
      .eq("meeting_id", id)
      .order("ordinal", { ascending: true }),
  ]);

  const agendaItems = (items ?? []) as AgendaItem[];

  const isHost = m.host_user_id === user.id;

  const { data: myPrompts } = isHost
    ? await supabase
        .from("prompts")
        .select("id,question,meeting_id")
        .eq("created_by", user.id)
        .is("meeting_id", null)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as { id: string; question: string; meeting_id: string | null }[] };

  const availablePrompts = ((myPrompts ?? []) as {
    id: string;
    question: string;
  }[]).map((p) => ({ id: p.id, question: p.question })) as PromptOption[];

  const viewerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const participantCount = m.participants_override
    ? m.participants_override.length
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={"/meetings" as never}
          className="text-muted-foreground hover:underline"
        >
          ← Meetings
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{m.title}</h1>
          <Badge variant={m.status === "live" ? "default" : "outline"}>
            {m.status}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>{fmtWhen(m.scheduled_start, m.timezone, viewerTz)}</span>
          <span>Host: {hostRow?.display_name ?? "?"}</span>
          {participantCount !== null && (
            <span>{participantCount} participants (restricted)</span>
          )}
        </div>
      </div>

      <MeetingLiveView
        meetingId={m.id}
        initialMeeting={{
          id: m.id,
          status: m.status,
          current_agenda_item_id: m.current_agenda_item_id,
        }}
        initialItems={agendaItems}
        isHost={isHost}
      />

      {isHost && m.status !== "ended" && (
        <section className="space-y-3 pt-4 border-t">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Edit agenda
          </h2>
          <AgendaEditor
            meetingId={m.id}
            items={agendaItems}
            availablePrompts={availablePrompts}
          />
        </section>
      )}
    </div>
  );
}
