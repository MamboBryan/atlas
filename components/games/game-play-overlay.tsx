"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerResult, RoundLite } from "@/lib/games/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TargetNumberRound } from "@/components/games/target-number-round";
import { ZeroInRound } from "@/components/games/zero-in-round";
import { RoundScoreboard } from "@/components/games/round-scoreboard";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GamePlayOverlay({
  round,
  onClose,
}: {
  round: RoundLite;
  onClose: () => void;
}) {
  const [results, setResults] = useState<PlayerResult[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus into the dialog on open, trap Tab/Shift+Tab
  // inside it so background content stays out of the tab order, and restore
  // focus to whatever triggered the overlay (normally the card's Play
  // button) once it closes.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const firstFocusable = root?.querySelector<HTMLElement>(
      FOCUSABLE_SELECTOR,
    );
    (firstFocusable ?? root)?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !active || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !active || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
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
      const { data, error } = await s
        .from("game_submissions")
        .select("player_id, points, payload, profiles!inner(display_name)")
        .eq("round_id", round.id)
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
  }, [finished, round.id]);

  const secret =
    round.puzzle.kind === "zero_in" && "secret" in round.puzzle
      ? round.puzzle.secret
      : null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto bg-ink text-paper outline-none"
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
