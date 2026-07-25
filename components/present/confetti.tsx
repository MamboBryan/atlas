"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

export function Confetti({ trigger }: { trigger: string | null }) {
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!trigger) return;
    if (last.current === trigger) return;
    last.current = trigger;

    confetti({
      particleCount: 120,
      spread: 80,
      startVelocity: 40,
      origin: { y: 0.55 },
      scalar: 1.1,
    });
    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 100,
        startVelocity: 30,
        origin: { y: 0.55, x: 0.35 },
      });
      confetti({
        particleCount: 60,
        spread: 100,
        startVelocity: 30,
        origin: { y: 0.55, x: 0.65 },
      });
    }, 180);
  }, [trigger]);

  return null;
}
