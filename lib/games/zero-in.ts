import type { ZeroInFeedback, ZeroInGuess, ZeroInPuzzle } from "./types";

export const ZERO_IN_DURATION_MS = 45_000;
export const ZERO_IN_MAX_GUESSES = 3;

export function generateZeroInPuzzle(
  rand: () => number = Math.random,
): ZeroInPuzzle {
  const secret = 1 + Math.floor(rand() * 1000);
  return { secret: Math.min(1000, secret) };
}

export function computeFeedback(secret: number, guess: number): ZeroInFeedback {
  if (guess === secret) return "exact";
  return guess < secret ? "higher" : "lower";
}

export function bestGuessDistance(
  secret: number,
  guesses: ZeroInGuess[],
): { bestGuess: number | null; distance: number } {
  if (guesses.length === 0) return { bestGuess: null, distance: Infinity };
  let bestGuess = guesses[0].value;
  let distance = Math.abs(secret - bestGuess);
  for (const g of guesses.slice(1)) {
    const d = Math.abs(secret - g.value);
    if (d < distance) {
      distance = d;
      bestGuess = g.value;
    }
  }
  return { bestGuess, distance };
}

type ScoreInput = {
  player_id: string;
  guesses: ZeroInGuess[];
  earliest_closest_at?: string;
};

export function scoreZeroInRound(
  secret: number,
  submissions: ScoreInput[],
): Array<{
  player_id: string;
  points: number;
  best_guess: number | null;
  distance: number;
}> {
  const enriched = submissions.map((s) => {
    const { bestGuess, distance } = bestGuessDistance(secret, s.guesses);
    return { ...s, bestGuess, distance };
  });

  // Determine the single "closest player": min distance, tiebreak by earliest_closest_at.
  const eligible = enriched.filter((e) => e.bestGuess !== null);
  let closestPlayerId: string | null = null;
  if (eligible.length > 0) {
    const sorted = [...eligible].sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      const at = a.earliest_closest_at ?? "";
      const bt = b.earliest_closest_at ?? "";
      return at.localeCompare(bt);
    });
    closestPlayerId = sorted[0]!.player_id;
  }

  return enriched.map((e) => {
    if (e.bestGuess === null) {
      return {
        player_id: e.player_id,
        points: 0,
        best_guess: null,
        distance: Infinity,
      };
    }
    let pts = 1; // participation
    if (e.distance <= 50) pts += 3; // within 5%
    if (e.distance <= 10) pts += 5; // within 1%
    if (e.player_id === closestPlayerId) pts += 12;
    if (e.distance === 0) pts += 25;
    return {
      player_id: e.player_id,
      points: pts,
      best_guess: e.bestGuess,
      distance: e.distance,
    };
  });
}
