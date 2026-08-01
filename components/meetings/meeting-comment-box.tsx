"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  postComment,
  deleteMyComment,
  toggleReaction,
} from "@/lib/actions/comment";

const EMOJIS = ["👍", "❤️", "😂", "🔥"] as const;

type Comment = {
  id: string;
  agenda_item_id: string | null;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

type Props = {
  meetingId: string;
  viewerId: string;
  isHost: boolean;
  currentAgendaItemId: string | null;
};

export function MeetingCommentBox({
  meetingId,
  viewerId,
  isHost,
  currentAgendaItemId,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<
    Record<string, { emoji: string; user_id: string }[]>
  >({});
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const knownCommentIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const cap = isHost ? 8 : 20;
    const { data } = await s
      .from("meeting_comments")
      .select(
        "id,agenda_item_id,author_user_id,body,created_at,deleted_at, profiles:profiles!meeting_comments_author_user_id_fkey(display_name)",
      )
      .eq("meeting_id", meetingId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(cap);
    if (!data) return;
    const rows: Comment[] = data.map((c) => ({
      id: c.id as string,
      agenda_item_id: c.agenda_item_id as string | null,
      author_user_id: c.author_user_id as string,
      author_name:
        (c as unknown as { profiles: { display_name: string } | null }).profiles
          ?.display_name ?? "?",
      body: c.body as string,
      created_at: c.created_at as string,
    }));
    setComments(rows);
    knownCommentIds.current = new Set(rows.map((r) => r.id));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      setReactions({});
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
    setReactions(grouped);
  }, [meetingId, isHost]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    // Guard: meeting_comment_reactions has no meeting_id column so we can't
    // server-side-filter. Skip refresh when the changed comment isn't ours.
    const loadIfKnown = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      const commentId =
        (payload.new?.comment_id as string | undefined) ??
        (payload.old?.comment_id as string | undefined);
      if (commentId && !knownCommentIds.current.has(commentId)) return;
      load();
    };
    // Per-mount unique name so StrictMode's remount doesn't hit the cached
    // (already-subscribed) channel that Supabase keeps by name.
    const ch = s
      .channel(`meeting-comments:${meetingId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "meeting_comments",
          filter: `meeting_id=eq.${meetingId}`,
        },
        load,
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "meeting_comment_reactions" },
        loadIfKnown,
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, load]);

  const submit = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed) return;
    start(async () => {
      const res = await postComment({
        meeting_id: meetingId,
        agenda_item_id: currentAgendaItemId,
        body: trimmed,
      });
      if (res.ok) setBody("");
    });
  }, [body, meetingId, currentAgendaItemId]);

  return (
    <section className="rounded-2xl border-2 border-ink/60 bg-surface-raised p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
          Comments · live
        </h3>
        {isHost && (
          <Link
            href={`/meetings/${meetingId}/present` as never}
            className="text-xs font-extrabold underline"
          >
            See all in Present →
          </Link>
        )}
      </div>
      <ol className="space-y-2 max-h-64 overflow-y-auto">
        {comments.length === 0 && (
          <li className="text-sm text-ink-soft">No comments yet.</li>
        )}
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            c={c}
            viewerId={viewerId}
            reactions={reactions[c.id] ?? []}
          />
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Comment…"
          maxLength={500}
          className="flex-1 rounded-xl border-2 border-ink/60 px-3 py-2 text-sm bg-surface"
        />
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="rounded-xl border-2 border-ink bg-ink px-3 py-2 text-sm text-surface font-extrabold disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}

function CommentRow({
  c,
  viewerId,
  reactions,
}: {
  c: Comment;
  viewerId: string;
  reactions: { emoji: string; user_id: string }[];
}) {
  const [pending, start] = useTransition();
  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count++;
      if (r.user_id === viewerId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return map;
  }, [reactions, viewerId]);

  const toggle = (emoji: (typeof EMOJIS)[number]) =>
    start(async () => {
      await toggleReaction({ comment_id: c.id, emoji });
    });
  const remove = () =>
    start(async () => {
      await deleteMyComment({ comment_id: c.id });
    });

  return (
    <li className="rounded-xl border-2 border-ink/40 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-black mr-1">{c.author_name}</span>
          <span>{c.body}</span>
        </div>
        {c.author_user_id === viewerId && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Delete comment"
            className="text-xs text-ink-soft hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {Array.from(grouped.entries()).map(([emoji, { count, mine }]) => (
          <button
            key={emoji}
            type="button"
            disabled={pending}
            onClick={() => toggle(emoji as (typeof EMOJIS)[number])}
            className={`text-xs rounded-full border px-2 py-0.5 ${mine ? "border-ink bg-ink text-surface" : "border-ink/40 bg-surface text-ink"}`}
          >
            {emoji} {count}
          </button>
        ))}
        {EMOJIS.filter((e) => !grouped.has(e)).map((e) => (
          <button
            key={e}
            type="button"
            disabled={pending}
            onClick={() => toggle(e)}
            className="text-xs opacity-40 hover:opacity-100"
          >
            {e}
          </button>
        ))}
      </div>
    </li>
  );
}
