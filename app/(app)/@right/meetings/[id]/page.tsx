import { requireUser } from "@/lib/auth/require";
import { MeetingCommentBox } from "@/components/meetings/meeting-comment-box";

export default async function MeetingsRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,status,host_user_id,current_agenda_item_id")
    .eq("id", id)
    .single();

  if (!meeting) return null;

  if (meeting.status !== "live") return null;

  return (
    <div className="space-y-8">
      <MeetingCommentBox
        meetingId={id}
        viewerId={user.id}
        isHost={meeting.host_user_id === user.id}
        currentAgendaItemId={meeting.current_agenda_item_id}
      />
    </div>
  );
}
