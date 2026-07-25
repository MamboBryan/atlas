"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { advanceMeetingAgenda, endMeeting } from "@/lib/actions/meeting";
import {
  deriveSlideState,
  type AgendaItemLite,
  type PromptLite,
} from "@/lib/present/slide-state";
import { paletteForOrdinal, standbyPalette, curtainPalette, type Palette } from "@/lib/present/palettes";
import { StandbySlide } from "@/components/present/slides/standby-slide";
import { DiscussionSlide } from "@/components/present/slides/discussion-slide";
import { PromptSlide } from "@/components/present/slides/prompt-slide";
import { PickerSlide } from "@/components/present/slides/picker-slide";
import { CurtainSlide } from "@/components/present/slides/curtain-slide";
import { PresentRail } from "@/components/present/present-rail";

export type PresentComment = {
  id: string;
  agenda_item_id: string | null;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type PresentShellProps = {
  viewerId: string;
  meetingId: string;
  meetingTitle: string;
  initialMeeting: {
    status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
    current_agenda_item_id: string | null;
    has_started: boolean;
  };
  initialItems: AgendaItemLite[];
  initialPromptsById: Record<string, PromptLite>;
  initialComments: PresentComment[];
  initialReactionsByComment: Record<string, { emoji: string; user_id: string }[]>;
};

export function PresentShell(props: PresentShellProps) {
  const router = useRouter();
  const [meeting, setMeeting] = useState(props.initialMeeting);
  const [items, setItems] = useState(props.initialItems);
  const [promptsById, setPromptsById] = useState(props.initialPromptsById);
  const [comments, setComments] = useState(props.initialComments);
  const [reactionsByComment, setReactionsByComment] = useState(props.initialReactionsByComment);
  const [_pending, start] = useTransition();
  const shellRef = useRef<HTMLDivElement | null>(null);

  const refreshMeeting = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("meetings")
      .select("status,current_agenda_item_id,has_started")
      .eq("id", props.meetingId)
      .single();
    if (data) setMeeting(data as typeof meeting);
  }, [props.meetingId, meeting]);

  const refreshItems = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("agenda_items")
      .select("id,ordinal,title,kind,prompt_id,picker_config,picker_result,timer_ends_at")
      .eq("meeting_id", props.meetingId)
      .order("ordinal", { ascending: true });
    if (data) setItems(data as AgendaItemLite[]);
  }, [props.meetingId]);

  const refreshPrompts = useCallback(async () => {
    const promptIds = items.filter((i) => i.prompt_id).map((i) => i.prompt_id as string);
    if (promptIds.length === 0) return;
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("prompts")
      .select("id,is_open,question,response_type,options,rating_min,rating_max")
      .in("id", promptIds);
    if (data) {
      setPromptsById(Object.fromEntries((data as PromptLite[]).map((p) => [p.id, p])));
    }
  }, [items]);

  // meeting + agenda_items + prompts channel
  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting:${props.meetingId}`)
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${props.meetingId}` },
        () => refreshMeeting(),
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "agenda_items", filter: `meeting_id=eq.${props.meetingId}` },
        () => { refreshItems(); refreshPrompts(); },
      )
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "prompts" },
        () => refreshPrompts(),
      )
      .subscribe();
    return () => { s.removeChannel(ch); };
  }, [props.meetingId, refreshMeeting, refreshItems, refreshPrompts]);

  // comments + reactions channel
  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const refreshComments = async () => {
      const { data } = await s
        .from("meeting_comments")
        .select("id,agenda_item_id,author_user_id,body,created_at,deleted_at, profiles:profiles!meeting_comments_author_user_id_fkey(display_name)")
        .eq("meeting_id", props.meetingId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        setComments(
          data.map((c) => ({
            id: c.id as string,
            agenda_item_id: c.agenda_item_id as string | null,
            author_user_id: c.author_user_id as string,
            author_name:
              (c as unknown as { profiles: { display_name: string } | null }).profiles?.display_name ?? "?",
            body: c.body as string,
            created_at: c.created_at as string,
          })),
        );
      }
      const ids = (data ?? []).map((c) => c.id as string);
      if (ids.length === 0) {
        setReactionsByComment({});
        return;
      }
      const { data: rx } = await s
        .from("meeting_comment_reactions")
        .select("comment_id,user_id,emoji")
        .in("comment_id", ids);
      const grouped: Record<string, { emoji: string; user_id: string }[]> = {};
      for (const r of rx ?? []) {
        const cid = r.comment_id as string;
        (grouped[cid] ??= []).push({ emoji: r.emoji as string, user_id: r.user_id as string });
      }
      setReactionsByComment(grouped);
    };
    const ch = s
      .channel(`meeting-comments:${props.meetingId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "meeting_comments", filter: `meeting_id=eq.${props.meetingId}` }, refreshComments)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "meeting_comment_reactions" }, refreshComments)
      .subscribe();
    return () => { s.removeChannel(ch); };
  }, [props.meetingId]);

  const slideState = useMemo(
    () => deriveSlideState(meeting, items, promptsById),
    [meeting, items, promptsById],
  );

  // "not-live" means the guard was raced. Send back.
  useEffect(() => {
    if (slideState.kind === "not-live") router.replace(`/meetings/${props.meetingId}`);
  }, [slideState, router, props.meetingId]);

  const advance = useCallback(
    (itemId: string | null) => {
      start(async () => {
        await advanceMeetingAgenda({ meeting_id: props.meetingId, item_id: itemId });
      });
    },
    [props.meetingId],
  );

  const advanceNext = useCallback(() => {
    if (slideState.kind === "standby") {
      if (items.length > 0) advance(items[0].id);
      return;
    }
    if (slideState.kind === "curtain") return;
    if ("item" in slideState) {
      const idx = items.findIndex((i) => i.id === slideState.item.id);
      const next = items[idx + 1];
      advance(next ? next.id : null);
    }
  }, [slideState, items, advance]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const editable = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (e.key === "Escape") {
        router.push(`/meetings/${props.meetingId}`);
        return;
      }
      if (editable) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advanceNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, props.meetingId, advanceNext]);

  const currentItem = "item" in slideState ? slideState.item : null;
  const palette: Palette =
    slideState.kind === "standby"
      ? standbyPalette
      : slideState.kind === "curtain"
        ? curtainPalette
        : currentItem
          ? paletteForOrdinal(currentItem.ordinal)
          : standbyPalette;

  const total = items.length;
  const index = currentItem ? items.findIndex((i) => i.id === currentItem.id) + 1 : 0;

  return (
    <div
      ref={shellRef}
      className="grid h-full w-full"
      style={{ gridTemplateColumns: "1fr 320px" }}
    >
      <div
        className="relative overflow-hidden flex flex-col"
        style={{ background: palette.bg, color: palette.ink }}
      >
        {slideState.kind === "standby" && (
          <StandbySlide
            palette={palette}
            meetingId={props.meetingId}
            meetingTitle={props.meetingTitle}
            items={items}
          />
        )}
        {slideState.kind === "discussion" && (
          <DiscussionSlide
            palette={palette}
            item={slideState.item}
            index={index}
            total={total}
            meetingTitle={props.meetingTitle}
            onNext={advanceNext}
          />
        )}
        {(slideState.kind === "prompt-open" || slideState.kind === "prompt-closed") && (
          <PromptSlide
            palette={palette}
            item={slideState.item}
            prompt={slideState.prompt}
            state={slideState.kind === "prompt-open" ? "open" : "closed"}
            index={index}
            total={total}
            meetingTitle={props.meetingTitle}
            meetingId={props.meetingId}
            onNext={advanceNext}
          />
        )}
        {(slideState.kind === "picker-oneshot-idle" ||
          slideState.kind === "picker-oneshot-revealed" ||
          slideState.kind === "picker-shuffle-idle" ||
          slideState.kind === "picker-shuffle-revealed") && (
          <PickerSlide
            palette={palette}
            item={slideState.item}
            state={
              slideState.kind === "picker-oneshot-idle" ? "oneshot-idle"
              : slideState.kind === "picker-oneshot-revealed" ? "oneshot-revealed"
              : slideState.kind === "picker-shuffle-idle" ? "shuffle-idle"
              : "shuffle-revealed"
            }
            index={index}
            total={total}
            meetingTitle={props.meetingTitle}
            meetingId={props.meetingId}
            onNext={advanceNext}
          />
        )}
        {slideState.kind === "curtain" && (
          <CurtainSlide
            palette={palette}
            meetingId={props.meetingId}
            meetingTitle={props.meetingTitle}
          />
        )}
      </div>

      <PresentRail
        palette={palette}
        viewerId={props.viewerId}
        meetingId={props.meetingId}
        currentAgendaItemId={meeting.current_agenda_item_id}
        comments={comments}
        reactionsByComment={reactionsByComment}
      />
    </div>
  );
}
