"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { advanceMeetingAgenda } from "@/lib/actions/meeting";
import {
  deriveSlideState,
  type AgendaItemLite,
  type PromptLite,
} from "@/lib/present/slide-state";
import {
  paletteForOrdinal,
  standbyPalette,
  curtainPalette,
  type Palette,
} from "@/lib/present/palettes";
import { StandbySlide } from "@/components/present/slides/standby-slide";
import { DiscussionSlide } from "@/components/present/slides/discussion-slide";
import { PromptSlide } from "@/components/present/slides/prompt-slide";
import { PickerSlide } from "@/components/present/slides/picker-slide";
import { CurtainSlide } from "@/components/present/slides/curtain-slide";
import { GameSlide } from "@/components/present/slides/game-slide";
import { PresentRail } from "@/components/present/present-rail";
import type { PlayerResult, RoundLite } from "@/lib/games/types";

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
  initialReactionsByComment: Record<
    string,
    { emoji: string; user_id: string }[]
  >;
  initialRounds: RoundLite[];
  eligibleCount: number;
};

export function PresentShell(props: PresentShellProps) {
  const router = useRouter();
  const [meeting, setMeeting] = useState(props.initialMeeting);
  const [items, setItems] = useState(props.initialItems);
  const [promptsById, setPromptsById] = useState(props.initialPromptsById);
  const [comments, setComments] = useState(props.initialComments);
  const [reactionsByComment, setReactionsByComment] = useState(
    props.initialReactionsByComment,
  );
  const [rounds, setRounds] = useState(props.initialRounds);
  const [roundResults, setRoundResults] = useState<PlayerResult[]>([]);
  const [_pending, start] = useTransition();
  const knownCommentIds = useRef<Set<string>>(new Set());

  const refreshMeeting = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("meetings")
      .select("status,current_agenda_item_id,has_started")
      .eq("id", props.meetingId)
      .single();
    if (data)
      setMeeting(
        data as {
          status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
          current_agenda_item_id: string | null;
          has_started: boolean;
        },
      );
  }, [props.meetingId]);

  const refreshItems = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("agenda_items")
      .select(
        "id,ordinal,title,kind,prompt_id,picker_config,picker_result,timer_ends_at",
      )
      .eq("meeting_id", props.meetingId)
      .order("ordinal", { ascending: true });
    if (data) setItems(data as AgendaItemLite[]);
  }, [props.meetingId]);

  const refreshPrompts = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    // Fetch prompt ids fresh from the DB so this callback doesn't close over `items` state.
    const { data: itemRows } = await s
      .from("agenda_items")
      .select("prompt_id")
      .eq("meeting_id", props.meetingId)
      .not("prompt_id", "is", null);
    const promptIds = (itemRows ?? [])
      .map((r) => r.prompt_id as string)
      .filter((id): id is string => !!id);
    if (promptIds.length === 0) {
      setPromptsById({});
      return;
    }
    const { data } = await s
      .from("prompts")
      .select("id,is_open,question,response_type,options,rating_min,rating_max")
      .in("id", promptIds);
    if (data) {
      setPromptsById(
        Object.fromEntries((data as PromptLite[]).map((p) => [p.id, p])),
      );
    }
  }, [props.meetingId]);

  const refreshRounds = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("game_rounds")
      .select("id,agenda_item_id,kind,puzzle,ends_at,status")
      .eq("meeting_id", props.meetingId);
    if (!data) return;
    setRounds(
      data.map((r) => {
        const row = r as {
          id: string;
          agenda_item_id: string;
          kind: "target_number" | "zero_in";
          puzzle: { target?: number; bases?: number[]; secret?: number };
          ends_at: string;
          status: "active" | "finished";
        };
        return {
          id: row.id,
          agenda_item_id: row.agenda_item_id,
          kind: row.kind,
          puzzle:
            row.kind === "target_number"
              ? {
                  kind: "target_number" as const,
                  target: row.puzzle.target ?? 0,
                  bases: row.puzzle.bases ?? [],
                }
              : row.status === "finished"
                ? { kind: "zero_in" as const, secret: row.puzzle.secret ?? 0 }
                : { kind: "zero_in" as const },
          ends_at: row.ends_at,
          status: row.status,
        };
      }),
    );
  }, [props.meetingId]);

  // meeting + agenda_items + prompts channel
  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting:${props.meetingId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${props.meetingId}`,
        },
        () => refreshMeeting(),
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "agenda_items",
          filter: `meeting_id=eq.${props.meetingId}`,
        },
        () => {
          refreshItems();
          refreshPrompts();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "prompts" },
        () => refreshPrompts(),
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "game_rounds",
          filter: `meeting_id=eq.${props.meetingId}`,
        },
        () => refreshRounds(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [
    props.meetingId,
    refreshMeeting,
    refreshItems,
    refreshPrompts,
    refreshRounds,
  ]);

  // comments + reactions channel
  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const refreshComments = async () => {
      const { data } = await s
        .from("meeting_comments")
        .select(
          "id,agenda_item_id,author_user_id,body,created_at,deleted_at, profiles:profiles!meeting_comments_author_user_id_fkey(display_name)",
        )
        .eq("meeting_id", props.meetingId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        const mapped = data.map((c) => ({
          id: c.id as string,
          agenda_item_id: c.agenda_item_id as string | null,
          author_user_id: c.author_user_id as string,
          author_name:
            (c as unknown as { profiles: { display_name: string } | null })
              .profiles?.display_name ?? "?",
          body: c.body as string,
          created_at: c.created_at as string,
        }));
        setComments(mapped);
        knownCommentIds.current = new Set(mapped.map((c) => c.id));
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
        (grouped[cid] ??= []).push({
          emoji: r.emoji as string,
          user_id: r.user_id as string,
        });
      }
      setReactionsByComment(grouped);
    };
    // Guard: only refresh reactions when the event concerns a comment we already
    // know about for this meeting.  meeting_comment_reactions has no meeting_id
    // column so we can't server-side-filter; instead we check the ref.
    const refreshReactionsIfKnown = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      const commentId =
        (payload.new?.comment_id as string | undefined) ??
        (payload.old?.comment_id as string | undefined);
      if (commentId && !knownCommentIds.current.has(commentId)) return;
      refreshComments();
    };
    const ch = s
      .channel(`meeting-comments:${props.meetingId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "meeting_comments",
          filter: `meeting_id=eq.${props.meetingId}`,
        },
        refreshComments,
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "meeting_comment_reactions" },
        refreshReactionsIfKnown,
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [props.meetingId]);

  const roundsByItemId = useMemo(
    () => Object.fromEntries(rounds.map((r) => [r.agenda_item_id, r])),
    [rounds],
  );

  const slideState = useMemo(
    () => deriveSlideState(meeting, items, promptsById, roundsByItemId),
    [meeting, items, promptsById, roundsByItemId],
  );

  const finishedRound =
    slideState.kind === "game-finished" ? slideState.round : null;

  useEffect(() => {
    if (!finishedRound) {
      setRoundResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = createSupabaseBrowserClient();
      const { data } = await s
        .from("game_submissions")
        .select("player_id, points, payload, profiles!inner(display_name)")
        .eq("round_id", finishedRound.id)
        .not("points", "is", null);
      if (cancelled || !data) return;
      const rows = data as unknown as Array<{
        player_id: string;
        points: number | null;
        payload: { best_result?: number; best_guess?: number } | null;
        profiles: { display_name: string };
      }>;
      setRoundResults(
        rows.map((r) => ({
          player_id: r.player_id,
          points: r.points ?? 0,
          display: `${r.profiles.display_name} · ${
            r.payload?.best_result ?? r.payload?.best_guess ?? "—"
          }`,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [finishedRound]);

  // "not-live" means the guard was raced. Send back.
  useEffect(() => {
    if (slideState.kind === "not-live")
      router.replace(`/meetings/${props.meetingId}`);
  }, [slideState, router, props.meetingId]);

  const advance = useCallback(
    (itemId: string | null) => {
      start(async () => {
        await advanceMeetingAgenda({
          meeting_id: props.meetingId,
          item_id: itemId,
        });
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
      const editable =
        tag === "input" || tag === "textarea" || target?.isContentEditable;
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
  const index = currentItem
    ? items.findIndex((i) => i.id === currentItem.id) + 1
    : 0;

  const [showComments, setShowComments] = useState(true);
  const [showComposer, setShowComposer] = useState(true);

  return (
    <div
      className="grid h-full w-full"
      style={{ gridTemplateColumns: showComments ? "1fr 320px" : "1fr" }}
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
        {(slideState.kind === "prompt-open" ||
          slideState.kind === "prompt-closed") && (
          <PromptSlide
            palette={palette}
            item={slideState.item}
            prompt={slideState.prompt}
            state={slideState.kind === "prompt-open" ? "open" : "closed"}
            index={index}
            total={total}
            meetingTitle={props.meetingTitle}
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
              slideState.kind === "picker-oneshot-idle"
                ? "oneshot-idle"
                : slideState.kind === "picker-oneshot-revealed"
                  ? "oneshot-revealed"
                  : slideState.kind === "picker-shuffle-idle"
                    ? "shuffle-idle"
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
        {(slideState.kind === "game-idle" ||
          slideState.kind === "game-active" ||
          slideState.kind === "game-finished") && (
          <GameSlide
            palette={palette}
            item={slideState.item}
            round={slideState.kind === "game-idle" ? null : slideState.round}
            index={index}
            total={total}
            meetingTitle={props.meetingTitle}
            eligibleCount={props.eligibleCount}
            results={roundResults}
            onNext={advanceNext}
          />
        )}

        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowComposer((v) => !v)}
            className="rounded-full border-2 px-3 py-1 text-[11px] uppercase tracking-widest font-black opacity-70 hover:opacity-100"
            style={{ borderColor: palette.ink, color: palette.ink }}
            aria-pressed={showComposer}
            title={showComposer ? "Hide composer" : "Show composer"}
          >
            {showComposer ? "Hide composer" : "Show composer"}
          </button>
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="rounded-full border-2 px-3 py-1 text-[11px] uppercase tracking-widest font-black opacity-70 hover:opacity-100"
            style={{ borderColor: palette.ink, color: palette.ink }}
            aria-pressed={showComments}
            title={showComments ? "Hide comments" : "Show comments"}
          >
            {showComments ? "Hide comments" : "Show comments"}
          </button>
        </div>
      </div>

      {showComments && (
        <PresentRail
          palette={palette}
          viewerId={props.viewerId}
          meetingId={props.meetingId}
          currentAgendaItemId={meeting.current_agenda_item_id}
          comments={comments}
          reactionsByComment={reactionsByComment}
          showComposer={showComposer}
        />
      )}
    </div>
  );
}
