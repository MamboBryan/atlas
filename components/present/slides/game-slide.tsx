"use client";

import { useCallback, useTransition } from "react";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite } from "@/lib/present/slide-state";
import type { PlayerResult, RoundLite } from "@/lib/games/types";
import { startRoundAction, finalizeRoundAction } from "@/lib/actions/game";
import { TARGET_NUMBER_DURATION_MS } from "@/lib/games/target-number";
import { ZERO_IN_DURATION_MS } from "@/lib/games/zero-in";
import { RoundCountdown } from "@/components/games/round-countdown";
import { SubmissionCounter } from "@/components/games/submission-counter";
import { RoundScoreboard } from "@/components/games/round-scoreboard";

export function GameSlide({
  palette,
  item,
  round,
  index,
  total,
  meetingTitle,
  eligibleCount,
  results,
  onNext,
}: {
  palette: Palette;
  item: AgendaItemLite;
  round: RoundLite | null;
  index: number;
  total: number;
  meetingTitle: string;
  eligibleCount: number;
  results: PlayerResult[];
  onNext: () => void;
}) {
  const [pending, start] = useTransition();

  const startRound = useCallback(() => {
    start(async () => {
      await startRoundAction({ agenda_item_id: item.id });
    });
  }, [item.id]);

  // Both the "Finish now" button and the countdown reaching zero land here.
  // atlas_finalize_game_round returns early when the round is already
  // finished, so a double call is harmless.
  const finish = useCallback(() => {
    if (!round) return;
    start(async () => {
      await finalizeRoundAction({ round_id: round.id });
    });
  }, [round]);

  return (
    <div className="flex h-full flex-col p-10">
      <div className="flex items-start justify-between text-xs uppercase tracking-widest font-extrabold opacity-90">
        <span>
          Item {String(index).padStart(2, "0")} of{" "}
          {String(total).padStart(2, "0")} · {meetingTitle}
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5"
          style={{ borderColor: palette.ink }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: palette.ink }}
          />
          Game
        </span>
      </div>

      {round === null && (
        <IdleBody
          palette={palette}
          title={item.title}
          pending={pending}
          onStart={startRound}
          onSkip={onNext}
        />
      )}

      {round !== null && round.status === "active" && (
        <ActiveBody
          palette={palette}
          round={round}
          eligibleCount={eligibleCount}
          pending={pending}
          onFinish={finish}
        />
      )}

      {round !== null && round.status === "finished" && (
        <FinishedBody
          palette={palette}
          round={round}
          results={results}
          pending={pending}
          onNext={onNext}
        />
      )}
    </div>
  );
}

function IdleBody({
  palette,
  title,
  pending,
  onStart,
  onSkip,
}: {
  palette: Palette;
  title: string;
  pending: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="flex-1 flex flex-col justify-center gap-4">
        <h1
          className="font-display font-black leading-none tracking-tight"
          style={{ fontSize: 88 }}
        >
          {title}
        </h1>
        <p className="max-w-2xl text-xl font-semibold opacity-80">
          A quick round for the room. The game is picked at random when you
          start.
        </p>
      </div>
      <footer className="flex items-end justify-between">
        <button
          type="button"
          className="rounded-xl border-2 px-5 py-3 font-extrabold disabled:opacity-60"
          style={{ borderColor: palette.ink, color: palette.ink }}
          onClick={onSkip}
          disabled={pending}
        >
          Skip game
        </button>
        <SlideButton palette={palette} disabled={pending} onClick={onStart}>
          Start round →
        </SlideButton>
      </footer>
    </>
  );
}

function ActiveBody({
  palette,
  round,
  eligibleCount,
  pending,
  onFinish,
}: {
  palette: Palette;
  round: RoundLite;
  eligibleCount: number;
  pending: boolean;
  onFinish: () => void;
}) {
  const totalMs =
    round.kind === "target_number"
      ? TARGET_NUMBER_DURATION_MS
      : ZERO_IN_DURATION_MS;

  return (
    <>
      <div className="flex-1 flex flex-col justify-center gap-8">
        {round.puzzle.kind === "target_number" ? (
          <div className="space-y-6">
            <div className="text-sm uppercase tracking-widest font-extrabold opacity-70">
              Hit the target
            </div>
            <div
              className="font-display font-black leading-none tabular-nums"
              style={{ fontSize: 140 }}
            >
              {round.puzzle.target}
            </div>
            <div className="flex flex-wrap gap-3">
              {round.puzzle.bases.map((b, i) => (
                <span
                  key={`${b}-${i}`}
                  className="rounded-xl border-2 px-6 py-4 text-4xl font-black tabular-nums"
                  style={{ borderColor: palette.ink }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm uppercase tracking-widest font-extrabold opacity-70">
              Zero in
            </div>
            <div
              className="font-display font-black leading-none"
              style={{ fontSize: 96 }}
            >
              1 — 1000
            </div>
            <p className="text-xl font-semibold opacity-80">
              Guess the secret number. Three tries, higher or lower after each.
            </p>
          </div>
        )}

        <RoundCountdown
          endsAt={round.ends_at}
          totalMs={totalMs}
          onExpire={onFinish}
        />
      </div>

      <footer className="flex items-end justify-between">
        <SubmissionCounter
          roundId={round.id}
          eligibleCount={eligibleCount}
        />
        <SlideButton palette={palette} disabled={pending} onClick={onFinish}>
          Finish now
        </SlideButton>
      </footer>
    </>
  );
}

function FinishedBody({
  palette,
  round,
  results,
  pending,
  onNext,
}: {
  palette: Palette;
  round: RoundLite;
  results: PlayerResult[];
  pending: boolean;
  onNext: () => void;
}) {
  const secret =
    round.puzzle.kind === "zero_in" && "secret" in round.puzzle
      ? round.puzzle.secret
      : null;

  return (
    <>
      <div className="flex-1 flex flex-col justify-center gap-6 overflow-hidden">
        {secret !== null && (
          <div>
            <div className="text-sm uppercase tracking-widest font-extrabold opacity-70">
              The secret was
            </div>
            <div
              className="font-display font-black leading-none tabular-nums"
              style={{ fontSize: 120 }}
            >
              {secret}
            </div>
          </div>
        )}
        <div className="overflow-y-auto">
          <RoundScoreboard
            roundId={round.id}
            kind={round.kind}
            initialResults={results}
          />
        </div>
      </div>
      <footer className="flex items-end justify-end">
        <SlideButton palette={palette} disabled={pending} onClick={onNext}>
          Next item →
        </SlideButton>
      </footer>
    </>
  );
}

function SlideButton({
  palette,
  disabled,
  onClick,
  children,
}: {
  palette: Palette;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border-2 px-5 py-3 font-extrabold shadow-[3px_3px_0_rgba(0,0,0,0.6)] disabled:opacity-60"
      style={{
        background: palette.accent,
        color: palette.accentInk,
        borderColor: palette.accentInk,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
