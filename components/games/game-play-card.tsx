"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RoundLite } from "@/lib/games/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { listMeetingRoundsAction } from "@/lib/actions/game";
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
  const [rounds, setRounds] = useState<RoundLite[]>([]);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [openedRoundId, setOpenedRoundId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [currentAgendaItemId, setCurrentAgendaItemId] = useState<
    string | null
  >(null);
  const instanceId = useId();

  // The card always shows the meeting's latest round. The overlay, once
  // opened, stays pinned to whatever round it was opened for (see below) —
  // it must not silently swap to a newer round the host starts later.
  const latest = rounds[0] ?? null;
  const overlayRound = rounds.find((r) => r.id === openedRoundId) ?? null;

  // refresh() rebuilds `rounds` (and therefore `latest`) into a fresh array
  // and object on every call, including calls triggered by this very
  // subscription. A ref lets the submissions effect below resolve "the
  // current latest round" without putting the `latest` object itself in
  // its dependency array — depending on the object would tear down and
  // rejoin the channel on every submission event.
  const latestRef = useRef<RoundLite | null>(null);
  latestRef.current = latest;

  const refresh = useCallback(async () => {
    // Routed through a server action rather than a direct table query: the
    // action redacts an active Zero In round's secret via the same
    // `publicize()` path startRoundAction uses. A direct client select on
    // game_rounds would ship the raw `puzzle` column (including the secret)
    // in the REST response before any client-side mapping ever ran.
    const res = await listMeetingRoundsAction({ meeting_id: meetingId });
    if (!res.ok) {
      console.error("listMeetingRoundsAction failed:", res.error);
      return;
    }

    const mapped: RoundLite[] = res.data.map((r) => ({
      id: r.round_id,
      agenda_item_id: r.agenda_item_id,
      kind: r.kind,
      puzzle: r.puzzle,
      ends_at: r.ends_at,
      status: r.status,
    }));
    setRounds(mapped);

    const top = mapped[0];
    if (!top) {
      setHasPlayed(false);
      setExpired(false);
      return;
    }
    setExpired(new Date(top.ends_at).getTime() <= Date.now());

    // No secret on this table — a direct client query is fine here.
    const s = createSupabaseBrowserClient();
    const { count, error } = await s
      .from("game_submissions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", top.id)
      .eq("player_id", viewerId);
    if (error) {
      console.error("game_submissions count query failed:", error);
      return;
    }
    setHasPlayed((count ?? 0) > 0);
  }, [meetingId, viewerId]);

  useEffect(() => {
    if (isHost) return;
    refresh();
  }, [isHost, refresh]);

  // Tracks which agenda item the meeting is currently "on", purely to
  // decide whether this card should render its own Play button — see
  // `ownedByRunner` below. Independent of MeetingLiveView's own copy of the
  // same value; a small duplicated subscription here is cheaper than
  // threading current_agenda_item_id down through the server page as a
  // prop shared between two otherwise-unrelated client components.
  const refreshCurrentItem = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("meetings")
      .select("current_agenda_item_id")
      .eq("id", meetingId)
      .single();
    setCurrentAgendaItemId(
      (data?.current_agenda_item_id as string | null) ?? null,
    );
  }, [meetingId]);

  useEffect(() => {
    if (isHost) return;
    refreshCurrentItem();
  }, [isHost, refreshCurrentItem]);

  useEffect(() => {
    if (isHost) return;
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting-game-current-item:${meetingId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${meetingId}`,
        },
        () => refreshCurrentItem(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, isHost, instanceId, refreshCurrentItem]);

  // game_rounds changes are only a trigger to re-fetch through the action —
  // the payload itself is never read, so a leaked column here is moot.
  useEffect(() => {
    if (isHost) return;
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
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, isHost, instanceId, refresh]);

  // Submissions subscription is scoped to the latest round's id so a
  // submission in some other meeting's round never wakes this card up.
  // Depends on latest?.id (a primitive) rather than the latest object —
  // refresh() produces a new object on every call, and depending on the
  // object would tear down and rejoin this channel on every submission
  // event, dropping events that land in the rejoin gap.
  useEffect(() => {
    const round = latestRef.current;
    if (isHost || !round) return;
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`meeting-game-subs:${meetingId}:${round.id}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "game_submissions",
          filter: `round_id=eq.${round.id}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [meetingId, isHost, instanceId, latest?.id, refresh]);

  // The round can lapse without any row changing, so watch the clock too.
  useEffect(() => {
    if (!latest || latest.status !== "active") return;
    const remaining = new Date(latest.ends_at).getTime() - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const t = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(t);
  }, [latest]);

  if (isHost || !latest) return null;

  // AgendaRunner (via GameAgendaItem) renders its own Play button whenever
  // the game item with the open round is the meeting's current agenda item
  // — the in-context surface. This card is the fallback nudge for when
  // that isn't true: the round is open but the host has moved on to a
  // different item (or a participant hasn't scrolled to "Now"), so the
  // runner's control isn't the thing putting the round in front of anyone.
  // Stand down only in the case both would actually be on screen at once,
  // so there's never two Play buttons for the same round simultaneously.
  const ownedByRunner = currentAgendaItemId === latest.agenda_item_id;
  const visible =
    latest.status === "active" && !hasPlayed && !expired && !ownedByRunner;

  return (
    <>
      {overlayRound && (
        <GamePlayOverlay
          round={overlayRound}
          onClose={() => setOpenedRoundId(null)}
        />
      )}
      {visible && !overlayRound && (
        <div className="sticky bottom-4 z-30 mx-auto flex max-w-xl items-center gap-4 rounded-2xl border-[2.5px] border-ink bg-accent px-5 py-4 text-accent-ink shadow-[-3px_3px_0_0_var(--accent-shadow)]">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-display font-extrabold uppercase tracking-widest opacity-70">
              Round in progress
            </div>
            <div className="font-display text-lg font-black leading-tight">
              {latest.kind === "target_number"
                ? "Hit the target number"
                : "Guess the secret number"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenedRoundId(latest.id)}
            className="shrink-0 rounded-xl border-2 border-current px-4 py-2 font-extrabold"
          >
            Play
          </button>
        </div>
      )}
    </>
  );
}
