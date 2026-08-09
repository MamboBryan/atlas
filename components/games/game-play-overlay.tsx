"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  // Rendered into a dedicated node appended directly to <body>, rather than
  // wherever this component happens to sit in the tree (the sticky card, or
  // an agenda item). That makes "everything except this dialog" trivially
  // computable as document.body's other children, which the scroll-lock /
  // inert effect below relies on.
  const [portalNode] = useState(() =>
    typeof document !== "undefined" ? document.createElement("div") : null,
  );

  // The overlay is fullscreen and modal, so the page underneath must not
  // scroll or stay reachable to assistive tech while it's open. `inert`
  // additionally covers pointer/keyboard interaction the Tab trap below
  // doesn't (e.g. a screen reader's own virtual cursor), and is dropped
  // from the accessibility tree entirely, unlike aria-hidden on content
  // that can still be focused.
  //
  // This must be a layout effect, not a regular effect: React flushes every
  // layout effect (setup on mount, cleanup on unmount) before any regular
  // effect's setup/cleanup runs in the same commit, regardless of
  // declaration order. The focus-management effect below depends on that
  // ordering both ways — appending portalNode to <body> has to happen
  // before it calls .focus() (focusing a detached node is a no-op), and
  // removing `inert` from the rest of the page has to happen before it
  // restores focus on close (focusing an inert element is also a no-op).
  useLayoutEffect(() => {
    if (!portalNode) return;
    const { body } = document;
    body.appendChild(portalNode);

    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const siblings = Array.from(body.children).filter(
      (el) => el !== portalNode,
    );
    for (const el of siblings) el.setAttribute("inert", "");

    return () => {
      body.style.overflow = previousOverflow;
      for (const el of siblings) el.removeAttribute("inert");
      body.removeChild(portalNode);
    };
  }, [portalNode]);

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

  if (!portalNode) return null;

  return createPortal(
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
    </div>,
    portalNode,
  );
}
