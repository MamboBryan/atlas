"use client";

import confetti from "canvas-confetti";

const COLORS = ["#4B4DF7", "#FFD84A", "#58CC02", "#FF4B4B", "#1CB0F6"];

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function fireConfetti(options?: { origin?: { x: number; y: number } }) {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 45,
    colors: COLORS,
    origin: options?.origin ?? { x: 0.5, y: 0.4 },
    scalar: 1.1,
    ticks: 120,
  });
}

/** Fire from a specific element's center (useful for celebrating on a button). */
export function fireConfettiFrom(el: HTMLElement | null) {
  if (!el) return fireConfetti();
  const rect = el.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  fireConfetti({ origin: { x, y } });
}
