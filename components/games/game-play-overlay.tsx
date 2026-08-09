"use client";

import { useEffect, useState } from "react";
import type { PlayerResult, RoundLite } from "@/lib/games/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TargetNumberRound } from "@/components/games/target-number-round";
import { ZeroInRound } from "@/components/games/zero-in-round";
import { RoundScoreboard } from "@/components/games/round-scoreboard";

export function GamePlayOverlay({
  round,
  onClose,
}: {
  round: RoundLite;
  onClose: () => void;
}) {
  const [results, setResults] = useState<PlayerResult[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const finished = round.status === "finished";

  // RoundScoreboard renders whatever it is handed — its own realtime hook only
  // calls router.refresh(), which cannot reach client state. Fetch here.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    (async () => {
      const s = createSupabaseBrowserClient();
      const { data } = await s
        .from("game_submissions")
        .select("player_id, points, payload, profiles!inner(display_name)")
        .eq("round_id", round.id)
        .not("points", "is", null);
      if (cancelled || !data) return;
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
  }, [finished, round.id]);

  const secret =
    round.puzzle.kind === "zero_in" && "secret" in round.puzzle
      ? round.puzzle.secret
      : null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink text-paper"
      role="dialog"
      aria-modal="true"
      aria-label="Play the round"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <span className="text-xs font-display font-extrabold uppercase tracking-widest opacity-70">
            {round.kind === "target_number" ? "Target Number" : "Zero In"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-2 border-current px-3 py-1 text-[11px] font-black uppercase tracking-widest opacity-70 hover:opacity-100"
          >
            Close
          </button>
        </header>

        {/*
          If the presenter finishes while this is open, swap to the result
          rather than yanking a fullscreen surface out from under the player.
        */}
        {finished ? (
          <div className="flex flex-1 flex-col gap-6">
            {secret !== null && (
              <div className="text-center">
                <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">
                  The secret was
                </div>
                <div className="font-display text-6xl font-black tabular-nums">
                  {secret}
                </div>
              </div>
            )}
            <RoundScoreboard
              roundId={round.id}
              kind={round.kind}
              initialResults={results}
            />
          </div>
        ) : round.puzzle.kind === "target_number" ? (
          <TargetNumberRound
            roundId={round.id}
            target={round.puzzle.target}
            bases={round.puzzle.bases}
            endsAt={round.ends_at}
          />
        ) : (
          <ZeroInRound roundId={round.id} endsAt={round.ends_at} />
        )}
      </div>
    </div>
  );
}
