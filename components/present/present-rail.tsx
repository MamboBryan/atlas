"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import type { PresentComment } from "@/components/present/present-shell";
import { postComment, deleteMyComment, toggleReaction } from "@/lib/actions/comment";

const EMOJIS = ["👍", "❤️", "😂", "🔥"] as const;

export function PresentRail({
  palette,
  viewerId,
  meetingId,
  currentAgendaItemId,
  comments,
  reactionsByComment,
}: {
  palette: Palette;
  viewerId: string;
  meetingId: string;
  currentAgendaItemId: string | null;
  comments: PresentComment[];
  reactionsByComment: Record<string, { emoji: string; user_id: string }[]>;
}) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

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
    <aside className="flex flex-col bg-white text-black border-l-2 border-dashed border-black/40">
      <div className="px-4 pt-4 text-[11px] uppercase tracking-widest font-black text-neutral-500">
        Comments · live
      </div>
      <ol className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {comments.length === 0 && (
          <li className="text-sm text-neutral-500">No comments yet.</li>
        )}
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            palette={palette}
            comment={c}
            viewerId={viewerId}
            reactions={reactionsByComment[c.id] ?? []}
          />
        ))}
      </ol>
      <form
        className="border-t-2 border-dashed border-black/40 p-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Comment as host…"
          className="flex-1 rounded-xl border-2 border-black/60 px-3 py-2 text-sm"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="rounded-xl border-2 border-black bg-black px-3 py-2 text-sm text-white font-extrabold disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

function CommentRow({
  palette,
  comment,
  viewerId,
  reactions,
}: {
  palette: Palette;
  comment: PresentComment;
  viewerId: string;
  reactions: { emoji: string; user_id: string }[];
}) {
  const [showPicker, setShowPicker] = useState(false);
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

  const toggle = useCallback(
    (emoji: string) => {
      start(async () => {
        await toggleReaction({ comment_id: comment.id, emoji: emoji as "👍" | "❤️" | "😂" | "🔥" });
      });
    },
    [comment.id],
  );

  const remove = useCallback(() => {
    start(async () => {
      await deleteMyComment({ comment_id: comment.id });
    });
  }, [comment.id]);

  return (
    <li
      className="rounded-xl border-2 border-black/70 bg-[#FFF6E5] px-3 py-2 text-sm"
      style={{ borderColor: `${palette.ink}66` }}
      onMouseEnter={() => setShowPicker(true)}
      onMouseLeave={() => setShowPicker(false)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-black mr-1">{comment.author_name}</span>
          <span className="leading-snug">{comment.body}</span>
        </div>
        {comment.author_user_id === viewerId && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Delete comment"
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            ×
          </button>
        )}
      </div>
      {(grouped.size > 0 || showPicker) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {Array.from(grouped.entries()).map(([emoji, { count, mine }]) => (
            <button
              key={emoji}
              type="button"
              disabled={pending}
              onClick={() => toggle(emoji)}
              className={`text-xs rounded-full border px-2 py-0.5 ${mine ? "border-black bg-black text-white" : "border-black/40 bg-white text-black"}`}
            >
              {emoji} {count}
            </button>
          ))}
          {showPicker && (
            <span className="ml-1 flex gap-1">
              {EMOJIS.filter((e) => !grouped.has(e)).map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(e)}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  {e}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
