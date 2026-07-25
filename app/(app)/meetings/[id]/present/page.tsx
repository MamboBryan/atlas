import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { PresentShell } from "@/components/present/present-shell";
import type { AgendaItemLite, PromptLite } from "@/lib/present/slide-state";

type MeetingRow = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
  host_user_id: string | null;
  current_agenda_item_id: string | null;
  has_started: boolean;
};

export default async function PresentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,title,status,host_user_id,current_agenda_item_id,has_started")
    .eq("id", id)
    .single();
  if (!meeting) notFound();

  const m = meeting as MeetingRow;
  if (m.status !== "live") redirect(`/meetings/${id}`);
  if (m.host_user_id !== user.id) redirect(`/meetings/${id}`);

  const { data: itemsRaw } = await supabase
    .from("agenda_items")
    .select(
      "id,ordinal,kind,prompt_id,picker_config,picker_result,timer_ends_at",
    )
    .eq("meeting_id", id)
    .order("ordinal", { ascending: true });

  const items = (itemsRaw ?? []) as AgendaItemLite[];

  const promptIds = items
    .filter((i) => i.kind === "prompt" && i.prompt_id)
    .map((i) => i.prompt_id as string);

  let promptsById: Record<string, PromptLite> = {};
  if (promptIds.length > 0) {
    const { data: prompts } = await supabase
      .from("prompts")
      .select("id,is_open,question,response_type,options,rating_min,rating_max")
      .in("id", promptIds);
    if (prompts) {
      promptsById = Object.fromEntries(
        (prompts as PromptLite[]).map((p) => [p.id, p]),
      );
    }
  }

  const { data: initialComments } = await supabase
    .from("meeting_comments")
    .select(
      "id,agenda_item_id,author_user_id,body,created_at,deleted_at, profiles:profiles!meeting_comments_author_user_id_fkey(display_name)",
    )
    .eq("meeting_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const commentIds = (initialComments ?? []).map((c) => c.id as string);
  let reactionsByComment: Record<string, { emoji: string; user_id: string }[]> =
    {};
  if (commentIds.length > 0) {
    const { data: reactions } = await supabase
      .from("meeting_comment_reactions")
      .select("comment_id,user_id,emoji")
      .in("comment_id", commentIds);
    if (reactions) {
      reactionsByComment = reactions.reduce<
        Record<string, { emoji: string; user_id: string }[]>
      >((acc, r) => {
        const cid = r.comment_id as string;
        (acc[cid] ??= []).push({
          emoji: r.emoji as string,
          user_id: r.user_id as string,
        });
        return acc;
      }, {});
    }
  }

  return (
    <PresentShell
      viewerId={user.id}
      meetingTitle={m.title}
      initialMeeting={{
        status: m.status,
        current_agenda_item_id: m.current_agenda_item_id,
        has_started: m.has_started,
      }}
      initialItems={items}
      initialPromptsById={promptsById}
      initialComments={(initialComments ?? []).map((c) => ({
        id: c.id as string,
        agenda_item_id: c.agenda_item_id as string | null,
        author_user_id: c.author_user_id as string,
        author_name:
          (
            c as unknown as {
              profiles: { display_name: string } | null;
            }
          ).profiles?.display_name ?? "?",
        body: c.body as string,
        created_at: c.created_at as string,
      }))}
      initialReactionsByComment={reactionsByComment}
      meetingId={id}
    />
  );
}
