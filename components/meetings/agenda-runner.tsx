"use client";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AgendaItem } from "@/components/meetings/agenda-editor";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  oneShotPick,
  setAgendaPickerResult,
  startShuffle,
} from "@/lib/actions/picker";
import { ShuffleRunner } from "@/components/tools/shuffle-runner";
import { listMeetingRoundsAction } from "@/lib/actions/game";
import { GamePlayOverlay } from "@/components/games/game-play-overlay";
import { RoundScoreboard } from "@/components/games/round-scoreboard";
import type { PlayerResult, RoundLite } from "@/lib/games/types";

function KindLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-display font-extrabold uppercase tracking-widest text-ink-soft">
      {children}
    </div>
  );
}

function RunnerCard({ children }: { children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

export function AgendaRunner({
  current,
  meetingId,
  isHost,
}: {
  current: AgendaItem | null;
  meetingId: string;
  isHost: boolean;
}) {
  if (!current) {
    return (
      <Card size="sm">
        <CardContent className="text-center text-sm text-ink-soft">
          Nothing selected. Host will advance to the next item.
        </CardContent>
      </Card>
    );
  }

  if (current.kind === "discussion") {
    return (
      <RunnerCard>
        <KindLabel>Discussion</KindLabel>
        <div className="font-display text-xl font-extrabold text-ink">
          {current.title}
        </div>
        <p className="text-sm text-ink-soft">
          Open discussion — no recording in v1.
        </p>
      </RunnerCard>
    );
  }

  if (current.kind === "picker") {
    return (
      <PickerAgendaItem item={current} meetingId={meetingId} isHost={isHost} />
    );
  }

  if (current.kind === "game") {
    return (
      <GameAgendaItem item={current} meetingId={meetingId} isHost={isHost} />
    );
  }

  return (
    <RunnerCard>
      <KindLabel>Prompt</KindLabel>
      <div className="font-display text-xl font-extrabold text-ink">
        {current.title}
      </div>
      {current.prompt_id && (
        <div className="pt-2 space-y-2">
          <Button
            variant="outline"
            render={<Link href={`/polls/${current.prompt_id}` as never} />}
          >
            Open prompt
          </Button>
          <p className="text-xs text-ink-soft">
            Live embed of the prompt lands with Phase 7.
          </p>
        </div>
      )}
    </RunnerCard>
  );
}

/**
 * Mirrors the sticky play card's own state machine (waiting / a way in /
 * results) so a participant who never has the sticky card or the fullscreen
 * overlay open at the right moment can still see the round from the agenda
 * panel — including the scoreboard and, for Zero In, the revealed secret,
 * once the presenter finishes.
 */
function GameAgendaItem({
  item,
  meetingId,
  isHost,
}: {
  item: AgendaItem;
  meetingId: string;
  isHost: boolean;
}) {
  const [round, setRound] = useState<RoundLite | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [playing, setPlaying] = useState(false);
  const instanceId = useId();

  // Routed through the server action rather than a direct table query, same
  // as the sticky card: it redacts an active Zero In round's secret via the
  // same publicize() path startRoundAction uses.
  const refresh = useCallback(async () => {
    const res = await listMeetingRoundsAction({ meeting_id: meetingId });
    if (!res.ok) {
      console.error("listMeetingRoundsAction failed:", res.error);
      setLoaded(true);
      return;
    }
    const mine = res.data.find((r) => r.agenda_item_id === item.id) ?? null;
    setRound(
      mine
        ? {
            id: mine.round_id,
            agenda_item_id: mine.agenda_item_id,
            kind: mine.kind,
            puzzle: mine.puzzle,
            ends_at: mine.ends_at,
            status: mine.status,
          }
        : null,
    );
    setLoaded(true);
  }, [meetingId, item.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`agenda-game:${meetingId}:${item.id}:${instanceId}`)
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
  }, [meetingId, item.id, instanceId, refresh]);

  const finished = round?.status === "finished";
  const finishedRoundId = finished ? round.id : null;

  // RoundScoreboard renders whatever initialResults it is handed — its own
  // realtime hook only calls router.refresh(), which cannot reach client
  // state — so, same as game-play-overlay.tsx, fetch results here.
  useEffect(() => {
    if (!finishedRoundId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = createSupabaseBrowserClient();
      const { data, error } = await s
        .from("game_submissions")
        .select("player_id, points, payload, profiles!inner(display_name)")
        .eq("round_id", finishedRoundId)
        .not("points", "is", null);
      if (cancelled) return;
      if (error) {
        console.error("game_submissions results query failed:", error);
        return;
      }
      if (!data) return;
      const rows = data as unknown as Array<{
        player_id: string;
        points: number | null;
        payload: { best_result?: number; best_guess?: number } | null;
        profiles: { display_name: string };
      }>;
      setResults(
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
  }, [finishedRoundId]);

  const secret =
    round?.puzzle.kind === "zero_in" && "secret" in round.puzzle
      ? round.puzzle.secret
      : null;

  return (
    <>
      {playing && round && round.status === "active" && (
        <GamePlayOverlay round={round} onClose={() => setPlaying(false)} />
      )}
      <RunnerCard>
        <KindLabel>Game</KindLabel>
        <div className="font-display text-xl font-extrabold text-ink">
          {item.title}
        </div>

        {!loaded ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : !round ? (
          <p className="text-sm text-ink-soft">
            {isHost
              ? "Start or skip this from present mode."
              : "Waiting for the host to start this round."}
          </p>
        ) : round.status === "active" ? (
          isHost ? (
            <p className="text-sm text-ink-soft">
              Round in progress — manage it from present mode.
            </p>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="text-sm text-ink-soft">
                A round is open on the big screen.
              </p>
              <Button onClick={() => setPlaying(true)}>Play</Button>
            </div>
          )
        ) : (
          <div className="space-y-3 pt-1">
            {secret !== null && (
              <p className="text-sm text-ink-soft">
                The secret was{" "}
                <span className="font-bold text-ink">{secret}</span>.
              </p>
            )}
            <RoundScoreboard
              roundId={round.id}
              kind={round.kind}
              initialResults={results}
            />
          </div>
        )}
      </RunnerCard>
    </>
  );
}

function PickerAgendaItem({
  item,
  meetingId,
  isHost,
}: {
  item: AgendaItem;
  meetingId: string;
  isHost: boolean;
}) {
  const config = item.picker_config;
  const result = item.picker_result;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [pickName, setPickName] = useState<string | null>(null);

  const oneshotUserId = result && "user_id" in result ? result.user_id : null;
  const shuffleSessionId =
    result && "shuffle_session_id" in result ? result.shuffle_session_id : null;

  const resolveName = useCallback(async (id: string) => {
    const s = createSupabaseBrowserClient();
    const { data } = await s
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .single();
    setPickName((data?.display_name as string) ?? "?");
  }, []);

  useEffect(() => {
    if (oneshotUserId) resolveName(oneshotUserId);
  }, [oneshotUserId, resolveName]);

  const doOneShot = () => {
    setErr(null);
    start(async () => {
      const pick = await oneShotPick(meetingId);
      if (!pick.ok) {
        setErr(pick.error.message);
        return;
      }
      const persist = await setAgendaPickerResult(item.id, {
        user_id: pick.data.user_id,
      });
      if (!persist.ok) {
        setErr(persist.error.message);
      }
    });
  };

  const doStartShuffle = () => {
    setErr(null);
    start(async () => {
      const s = await startShuffle(meetingId);
      if (!s.ok) {
        setErr(s.error.message);
        return;
      }
      const persist = await setAgendaPickerResult(item.id, {
        shuffle_session_id: s.data.id,
      });
      if (!persist.ok) {
        setErr(persist.error.message);
      }
    });
  };

  if (!config) {
    return (
      <Card size="sm">
        <CardContent className="text-sm text-danger-text">
          Missing picker config.
        </CardContent>
      </Card>
    );
  }

  return (
    <RunnerCard>
      <KindLabel>Picker · {config.mode}</KindLabel>
      <div className="font-display text-xl font-extrabold text-ink">
        {item.title}
      </div>

      {config.mode === "oneshot" && (
        <div className="space-y-3 pt-2">
          {oneshotUserId ? (
            <Card size="sm" className="!py-6">
              <CardContent className="text-center">
                <div className="text-xs uppercase tracking-widest font-display font-extrabold text-ink-soft">
                  And the pick is
                </div>
                <div className="font-display text-3xl font-extrabold text-ink pt-1">
                  {pickName ?? "…"}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card size="sm" className="!py-6">
              <CardContent className="text-center text-sm text-ink-soft">
                {isHost ? "Click Pick to draw." : "Waiting for host to pick."}
              </CardContent>
            </Card>
          )}
          {isHost && (
            <div className="flex justify-center">
              <Button onClick={doOneShot} disabled={pending}>
                {pending ? "…" : oneshotUserId ? "Pick again" : "Pick"}
              </Button>
            </div>
          )}
        </div>
      )}

      {config.mode === "shuffle" && (
        <div className="space-y-3 pt-2">
          {shuffleSessionId ? (
            <ShuffleRunner
              sessionId={shuffleSessionId}
              meetingId={meetingId}
              canControl={isHost}
            />
          ) : isHost ? (
            <div className="flex justify-center">
              <Button onClick={doStartShuffle} disabled={pending}>
                {pending ? "…" : "Start shuffle"}
              </Button>
            </div>
          ) : (
            <Card size="sm" className="!py-6">
              <CardContent className="text-center text-sm text-ink-soft">
                Waiting for host to start.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {err && (
        <p className="text-sm text-danger-text text-center" role="alert">
          {err}
        </p>
      )}
    </RunnerCard>
  );
}
