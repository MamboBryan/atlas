"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Slot-machine name cycle.
 *
 * `run` rapidly cycles `displayed` through `pool` with a decaying interval
 * (40ms → 200ms over ~1.5s), lands on `finalName`, then calls `onLand`. Honors
 * `prefers-reduced-motion` by skipping the cycle and landing immediately.
 *
 * Extracted from the original PickRunner so both the pick and shuffle tools
 * share the same "loading when selecting" moment.
 */
export function useSlotMachine(initial = "…") {
  const [displayed, setDisplayed] = useState<string>(initial);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup any pending tick on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSpinning(false);
  }, []);

  const run = useCallback(
    (finalName: string, pool: string[], onLand?: () => void) => {
      if (spinning) return;

      // Reduced motion: skip animation, land immediately.
      if (prefersReducedMotion() || pool.length === 0) {
        setDisplayed(finalName);
        onLand?.();
        return;
      }

      setSpinning(true);

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
          START_INTERVAL +
          (END_INTERVAL - START_INTERVAL) * progress * progress;

        if (progress >= 1) {
          setDisplayed(finalName);
          setSpinning(false);
          timerRef.current = null;
          onLand?.();
          return;
        }

        setDisplayed(pool[idx % pool.length]);
        idx++;
        timerRef.current = setTimeout(tick, delay);
      };

      timerRef.current = setTimeout(tick, START_INTERVAL);
    },
    [spinning],
  );

  return { displayed, spinning, run, stop, setDisplayed };
}
