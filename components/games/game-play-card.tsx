"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { RoundLite } from "@/lib/games/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GamePlayOverlay } from "@/components/games/game-play-overlay";

/**
 * Nudges everyone except the presenter to play the open round. It clears
 * itself the moment it stops being relevant: the viewer submits, the
 * presenter finishes, or the clock runs out.
 */
export function GamePlayCard({
  meetingId,
  viewerId,
  isHost,
}: {
  meetingId: string;
  viewerId: string;
  isHost: boolean;
}) {
  const [round, setRound] = useState<RoundLite | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [open, setOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const instanceId = useId();

  const refresh = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    // Deliberately NOT filtered to status = 'active'. If it were, the round
    // would drop out of state the moment the presenter finished and React
    // would unmount an open overlay mid-interaction. Card visibility is
    // derived from status further down instead.
    const { data } = await s
      .from("game_rounds")
      .select("id,agenda_item_id,kind,puzzle,ends_at,status,started_at")
      .eq("meeting_id", meetingId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      setRound(null);
      setHasPlayed(false);
      setExpired(false);
      return;
    }

    const row = data as {
      id: string;
      agenda_item_id: string;
      kind: "target_number" | "zero_in";
      puzzle: { target?: number; bases?: number[]; secret?: number };
      ends_at: string;
      status: "active" | "finished";
    };

    setRound({
      id: row.id,
      agenda_item_id: row.agenda_item_id,
      kind: row.kind,
      puzzle:
        row.kind === "target_number"
          ? {
              kind: "target_number",
              target: row.puzzle.target ?? 0,
              bases: row.puzzle.bases ?? [],
            }
          : row.status === "finished"
            ? { kind: "zero_in", secret: row.puzzle.secret ?? 0 }
            : { kind: "zero_in" },
      ends_at: row.ends_at,
      status: row.status,
    });
    setExpired(new Date(row.ends_at).getTime() <= Date.now());

    const { count } = await s
      .from("game_submissions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", row.id)
      .eq("player_id", viewerId);
    setHasPlayed((count ?? 0) > 0);
  }, [meetingId, viewerId]);

  useEffect(() => {
    if (isHost) return;
    refresh();
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting-game:${meetingId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "game_rounds",
          filter: `meeting_id=eq.${meetingId}`,
        },
        () => refresh(),
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "game_submissions" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, isHost, instanceId, refresh]);

  // The round can lapse without any row changing, so watch the clock too.
  useEffect(() => {
    if (!round || round.status !== "active") return;
    const remaining = new Date(round.ends_at).getTime() - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const t = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(t);
  }, [round]);

  if (isHost || !round) return null;

  const visible = round.status === "active" && !hasPlayed && !expired;

  return (
    <>
      {open && (
        <GamePlayOverlay round={round} onClose={() => setOpen(false)} />
      )}
      {visible && !open && (
        <div className="sticky bottom-4 z-30 mx-auto flex max-w-xl items-center gap-4 rounded-2xl border-[2.5px] border-ink bg-accent px-5 py-4 text-accent-ink shadow-[-3px_3px_0_0_var(--accent-shadow)]">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-display font-extrabold uppercase tracking-widest opacity-70">
              Round in progress
            </div>
            <div className="font-display text-lg font-black leading-tight">
              {round.kind === "target_number"
                ? "Hit the target number"
                : "Guess the secret number"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl border-2 border-current px-4 py-2 font-extrabold"
          >
            Play
          </button>
        </div>
      )}
    </>
  );
}
