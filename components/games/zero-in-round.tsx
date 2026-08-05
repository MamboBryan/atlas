"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoundCountdown } from "./round-countdown";
import { submitZeroInGuessAction } from "@/lib/actions/game";
import { ZERO_IN_MAX_GUESSES, ZERO_IN_DURATION_MS } from "@/lib/games/zero-in";
import type { ZeroInFeedback } from "@/lib/games/types";

type UiGuess = { value: number; feedback: ZeroInFeedback };

export function ZeroInRound({
  roundId,
  endsAt,
}: {
  roundId: string;
  endsAt: string;
}) {
  const [value, setValue] = useState("");
  const [guesses, setGuesses] = useState<UiGuess[]>([]);
  const [pending, startTx] = useTransition();
  const guessesLeft = ZERO_IN_MAX_GUESSES - guesses.length;
  const done = guesses.some((g) => g.feedback === "exact") || guessesLeft === 0;

  function submit() {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("Enter a whole number between 1 and 1000.");
      return;
    }
    startTx(async () => {
      const res = await submitZeroInGuessAction({
        round_id: roundId,
        guess: n,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setGuesses((prev) => [
        ...prev,
        { value: n, feedback: res.data.feedback },
      ]);
      setValue("");
      if (res.data.feedback === "exact")
        toast.success("Exact! Wait for the reveal.");
    });
  }

  return (
    <div className="space-y-4">
      <RoundCountdown endsAt={endsAt} totalMs={ZERO_IN_DURATION_MS} />
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Secret number
        </div>
        <div className="text-4xl font-bold">1 – 1000</div>
        <div className="text-sm text-muted-foreground">
          {done
            ? "You're done — waiting for reveal."
            : `${guessesLeft} guesses left`}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={done || pending}
          placeholder="Your guess"
        />
        <Button onClick={submit} disabled={done || pending || value === ""}>
          Guess
        </Button>
      </div>

      <ol className="space-y-1">
        {guesses.map((g, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border px-3 py-2 font-mono"
          >
            <span>{g.value}</span>
            <span
              className={
                g.feedback === "exact"
                  ? "text-green-600"
                  : g.feedback === "higher"
                    ? "text-amber-600"
                    : "text-blue-600"
              }
            >
              {g.feedback === "exact"
                ? "exact!"
                : g.feedback === "higher"
                  ? "higher ↑"
                  : "lower ↓"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
