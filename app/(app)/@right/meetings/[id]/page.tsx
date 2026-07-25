import { requireUser } from "@/lib/auth/require";
import {
  AgendaAddItem,
  type PromptOption,
} from "@/components/meetings/agenda-add-item";
import { MeetingCommentBox } from "@/components/meetings/meeting-comment-box";

export default async function MeetingRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,host_user_id,status,current_agenda_item_id")
    .eq("id", id)
    .single();

  if (!meeting) {
    return <p className="text-sm text-ink-soft">Meeting not found.</p>;
  }
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return (
      <p className="text-sm text-ink-soft">
        Agenda is locked for a {meeting.status} meeting.
      </p>
    );
  }
  // Any participant can add items during a live meeting; otherwise host-only.
  const canAdd =
    meeting.status === "live" || meeting.host_user_id === user.id;

  const { data: promptRows } = canAdd
    ? await supabase
        .from("prompts")
        .select("id,question,meeting_id,is_open")
        .eq("created_by", user.id)
        .eq("is_open", true)
        .is("meeting_id", null)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: null };

  const availablePrompts: PromptOption[] = ((promptRows ?? []) as {
    id: string;
    question: string;
  }[]).map((p) => ({ id: p.id, question: p.question }));

  return (
    <div key={id} className="space-y-8">
      {canAdd ? (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-extrabold text-ink">
            Add agenda item
          </h2>
          <AgendaAddItem
            meetingId={id}
            availablePrompts={availablePrompts}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          Only the host can edit the agenda before it starts.
        </p>
      )}
      {meeting.status === "live" && (
        <MeetingCommentBox
          meetingId={id}
          viewerId={user.id}
          isHost={meeting.host_user_id === user.id}
          currentAgendaItemId={meeting.current_agenda_item_id}
        />
      )}
    </div>
  );
}
