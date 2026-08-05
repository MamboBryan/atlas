import { expect, test } from "vitest";
import {
  generateZeroInPuzzle,
  computeFeedback,
  bestGuessDistance,
  scoreZeroInRound,
  ZERO_IN_MAX_GUESSES,
} from "@/lib/games/zero-in";
import type { ZeroInGuess } from "@/lib/games/types";

test("puzzle: secret in [1,1000]", () => {
  for (let i = 0; i < 100; i++) {
    const p = generateZeroInPuzzle();
    expect(p.secret).toBeGreaterThanOrEqual(1);
    expect(p.secret).toBeLessThanOrEqual(1000);
  }
});

test("feedback: exact / higher / lower", () => {
  expect(computeFeedback(500, 500)).toBe("exact");
  expect(computeFeedback(500, 400)).toBe("higher");
  expect(computeFeedback(500, 600)).toBe("lower");
});

test("bestGuessDistance: picks the closest guess", () => {
  const gs: ZeroInGuess[] = [
    { value: 400, at: "t1", feedback: "higher" },
    { value: 600, at: "t2", feedback: "lower" },
    { value: 480, at: "t3", feedback: "higher" },
  ];
  expect(bestGuessDistance(500, gs)).toEqual({ bestGuess: 480, distance: 20 });
});

test("bestGuessDistance: no guesses returns null / Infinity", () => {
  expect(bestGuessDistance(500, [])).toEqual({
    bestGuess: null,
    distance: Infinity,
  });
});

test("ZERO_IN_MAX_GUESSES is 3", () => {
  expect(ZERO_IN_MAX_GUESSES).toBe(3);
});

test("score: exact match stacks all tiers (25 + 12 + 5 + 3 + 1 = 46)", () => {
  const results = scoreZeroInRound(500, [
    {
      player_id: "p1",
      guesses: [{ value: 500, at: "2026-01-01T00:00:00Z", feedback: "exact" }],
      earliest_closest_at: "2026-01-01T00:00:00Z",
    },
  ]);
  expect(results[0]).toMatchObject({ player_id: "p1", points: 46 });
});

test("score: closest but not exact (within 1%) = 12 + 5 + 3 + 1 = 21", () => {
  const results = scoreZeroInRound(500, [
    {
      player_id: "p1",
      guesses: [{ value: 495, at: "t", feedback: "higher" }],
      earliest_closest_at: "t",
    },
  ]);
  expect(results[0].points).toBe(21);
});

test("score: within 5% but not 1% (only me playing) = 12 + 3 + 1 = 16", () => {
  const results = scoreZeroInRound(500, [
    {
      player_id: "p1",
      guesses: [{ value: 450, at: "t", feedback: "higher" }],
      earliest_closest_at: "t",
    },
  ]);
  expect(results[0].points).toBe(16);
});

test("score: 'closest player' awarded to earliest submitter on tie", () => {
  const results = scoreZeroInRound(500, [
    {
      player_id: "p1",
      guesses: [{ value: 490, at: "2026-01-01T00:00:05Z", feedback: "higher" }],
      earliest_closest_at: "2026-01-01T00:00:05Z",
    },
    {
      player_id: "p2",
      guesses: [{ value: 490, at: "2026-01-01T00:00:02Z", feedback: "higher" }],
      earliest_closest_at: "2026-01-01T00:00:02Z",
    },
  ]);
  const p1 = results.find((r) => r.player_id === "p1")!;
  const p2 = results.find((r) => r.player_id === "p2")!;
  expect(p2.points).toBeGreaterThan(p1.points);
});

test("score: player with no guesses gets 0", () => {
  const results = scoreZeroInRound(500, [{ player_id: "p1", guesses: [] }]);
  expect(results[0].points).toBe(0);
});

test("score: player who submitted but was far gets participation 1", () => {
  const results = scoreZeroInRound(500, [
    {
      player_id: "p1",
      guesses: [{ value: 900, at: "t", feedback: "lower" }],
      earliest_closest_at: "t",
    },
    {
      player_id: "p2",
      guesses: [{ value: 100, at: "t", feedback: "higher" }],
      earliest_closest_at: "t",
    },
  ]);
  // Neither is within 5% (±50). Closest is p1 (distance 400) vs p2 (400). Tie → earliest wins closest bonus.
  const total = results.reduce((n, r) => n + r.points, 0);
  expect(total).toBeGreaterThan(0);
  const noBonusPlayer = results.find((r) => r.points === 1);
  expect(noBonusPlayer).toBeDefined();
});
