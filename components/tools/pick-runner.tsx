"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sticker } from "@/components/ui/sticker";
import { fireConfetti } from "@/components/ui/confetti-burst";
import { listEligibleNames } from "@/lib/actions/picker";

type Candidate = { id: string; display_name: string };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fisher-Yates shuffle (in-place). */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Slot-machine pick runner.
 *
 * Fetches eligible roster members, then on "Pick!" cycles rapidly through
 * display names with a decaying interval (40ms → 200ms over ~1.5 s), lands on
 * a random winner, fires confetti, and shows the winner with a peace-hand
 * sticker.
 */
export function PickRunner({ meetingId }: { meetingId?: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [displayed, setDisplayed] = useState<string>("…");
  const [winner, setWinner] = useState<Candidate | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load eligible names once on mount.
  useEffect(() => {
    listEligibleNames(meetingId ?? null).then((res) => {
      if (!res.ok) {
        setLoadErr(res.error.message);
        return;
      }
      setCandidates(res.data);
      if (res.data.length > 0) {
        setDisplayed(res.data[0].display_name);
      }
    });
  }, [meetingId]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearTimeout(intervalRef.current);
    };
  }, []);

  const startSpin = useCallback(() => {
    if (spinning || candidates.length === 0) return;
    setWinner(null);
    setSpinning(true);

    // Reduced motion: skip animation, show result immediately.
    if (prefersReducedMotion()) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      setDisplayed(pick.display_name);
      setWinner(pick);
      setSpinning(false);
      fireConfetti();
      return;
    }

    // Pick winner upfront.
    const shuffled = shuffleArray(candidates);
    const finalPick = shuffled[Math.floor(Math.random() * shuffled.length)];

    const START_INTERVAL = 40; // ms
    const END_INTERVAL = 200; // ms
    const TOTAL_DURATION = 1500; // ms
    const startTime = performance.now();

    let idx = 0;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);
      // ease-out: delay grows as progress → 1
      const delay =
        START_INTERVAL + (END_INTERVAL - START_INTERVAL) * progress * progress;

      if (progress >= 1) {
        // Land on winner.
        setDisplayed(finalPick.display_name);
        setWinner(finalPick);
        setSpinning(false);
        fireConfetti();
        intervalRef.current = null;
        return;
      }

      // Cycle through names.
      setDisplayed(shuffled[idx % shuffled.length].display_name);
      idx++;
      intervalRef.current = setTimeout(tick, delay);
    };

    intervalRef.current = setTimeout(tick, START_INTERVAL);
  }, [spinning, candidates]);

  const reset = useCallback(() => {
    if (intervalRef.current !== null) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setWinner(null);
    setSpinning(false);
    if (candidates.length > 0) setDisplayed(candidates[0].display_name);
  }, [candidates]);

  if (loadErr) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive" role="alert">
            {loadErr}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-ink-soft animate-pulse">
          Loading roster…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Slot display */}
      <Card className="relative overflow-hidden min-h-48 flex items-center justify-center">
        <CardContent className="py-10 flex flex-col items-center gap-4 w-full">
          {winner ? (
            <>
              <p className="text-xs uppercase tracking-widest text-ink-soft font-display font-extrabold">
                And the pick is
              </p>
              <p
                key={winner.id}
                className="text-5xl font-display font-black text-center leading-tight animate-rise-in"
              >
                {winner.display_name}
              </p>
            </>
          ) : (
            <p
              className={
                "text-5xl font-display font-black text-center leading-tight tabular-nums" +
                (spinning ? " text-ink-soft" : "")
              }
            >
              {displayed}
            </p>
          )}
        </CardContent>

        {/* Peace-hand sticker peeking from bottom-right after pick */}
        {winner && (
          <span
            aria-hidden="true"
            className="absolute -bottom-6 -right-4 animate-rise-in"
          >
            <Sticker name="peace-hand" size="xl" rotate={-8} />
          </span>
        )}
      </Card>

      {/* Controls */}
      <div className="flex justify-center gap-3">
        <Button
          size="lg"
          variant="accent"
          onClick={startSpin}
          disabled={spinning}
        >
          Pick!
        </Button>
        {winner && (
          <Button size="lg" variant="outline" onClick={reset}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
