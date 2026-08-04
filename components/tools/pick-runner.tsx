"use client";

import { useCallback, useEffect, useState } from "react";
import { Confetti } from "@/components/present/confetti";
import { ToolStage } from "@/components/tools/tool-stage";
import { useSlotMachine } from "@/lib/tools/use-slot-machine";
import { stagePalettes } from "@/lib/present/palettes";
import { listEligibleNames } from "@/lib/actions/picker";

type Candidate = { id: string; display_name: string };

/**
 * Full-screen "pick someone" tool.
 *
 * Loads the eligible roster, then on "Pick!" runs a slot-machine cycle
 * (see `useSlotMachine`) that lands on a random winner, fires confetti, and
 * spotlights the name on a colorful full-screen stage that rotates palette on
 * each pick.
 */
export function PickRunner({ meetingId }: { meetingId?: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [winner, setWinner] = useState<Candidate | null>(null);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const { displayed, spinning, run } = useSlotMachine("Pick Someone");

  const palette = stagePalettes[paletteIdx % stagePalettes.length];

  // Load eligible names once on mount.
  useEffect(() => {
    listEligibleNames(meetingId ?? null).then((res) => {
      if (!res.ok) {
        setLoadErr(res.error.message);
        return;
      }
      setCandidates(res.data);
    });
  }, [meetingId]);

  const startSpin = useCallback(() => {
    if (spinning || candidates.length === 0) return;
    setWinner(null);
    setPaletteIdx((i) => i + 1);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    run(
      pick.display_name,
      candidates.map((c) => c.display_name),
      () => setWinner(pick),
    );
  }, [spinning, candidates, run]);

  const empty = !loadErr && candidates.length === 0;

  return (
    <ToolStage
      palette={palette}
      eyebrow="Pick someone"
      footer={
        loadErr || empty ? null : (
          <button
            type="button"
            disabled={spinning}
            onClick={startSpin}
            className="rounded-2xl border-2 px-8 py-4 text-2xl font-black shadow-[6px_6px_0_rgba(0,0,0,0.7)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0_rgba(0,0,0,0.7)] disabled:opacity-60"
            style={{
              background: palette.accent,
              color: palette.accentInk,
              borderColor: palette.accentInk,
            }}
          >
            {spinning ? "…" : winner ? "Pick again" : "Pick!"}
          </button>
        )
      }
    >
      <Confetti trigger={winner?.id ?? null} />

      {loadErr ? (
        <p className="text-center text-lg font-extrabold" role="alert">
          {loadErr}
        </p>
      ) : empty ? (
        <p className="animate-pulse text-center text-lg font-extrabold opacity-80">
          Loading roster…
        </p>
      ) : winner ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest opacity-80">
            And the pick is
          </span>
          <span
            key={winner.id}
            className="animate-rise-in font-black leading-none tracking-tight"
            style={{ fontSize: "clamp(3rem, 12vw, 7rem)" }}
          >
            {winner.display_name}
          </span>
        </div>
      ) : (
        <span
          className={
            "text-center font-black leading-none tracking-tight tabular-nums" +
            (spinning ? " opacity-70" : "")
          }
          style={{ fontSize: "clamp(3rem, 12vw, 7rem)" }}
        >
          {displayed}
        </span>
      )}
    </ToolStage>
  );
}
