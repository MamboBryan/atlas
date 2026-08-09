import type { GameKind, PublicPuzzle } from "@/lib/games/types";

/**
 * Redact a raw `game_rounds.puzzle` column down to what a client may see.
 * Zero In's secret is withheld while the round is active and only appears
 * once it is finished. This is the one place that decision is made — every
 * caller that hands a puzzle to a client (the startRoundAction/
 * listMeetingRoundsAction server actions, and the present page's server
 * component, which reads game_rounds directly) must route through this
 * function rather than re-implement the redaction.
 */
export function publicizePuzzle(
  kind: GameKind,
  puzzle: unknown,
  status: "active" | "finished",
): PublicPuzzle {
  if (kind === "target_number") {
    const p = puzzle as { target: number; bases: number[] };
    return { kind: "target_number", target: p.target, bases: p.bases };
  }
  const p = puzzle as { secret: number };
  if (status === "finished") {
    return { kind: "zero_in", secret: p.secret };
  }
  return { kind: "zero_in" };
}
