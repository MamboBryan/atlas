export type GameKind = "target_number" | "zero_in";

export type TargetNumberPuzzle = { target: number; bases: number[] };
export type ZeroInPuzzle = { secret: number };

export type Puzzle =
  | { kind: "target_number"; data: TargetNumberPuzzle }
  | { kind: "zero_in"; data: ZeroInPuzzle };

export type TargetNumberOp = {
  op: "+" | "-" | "*" | "/";
  left: number;
  right: number;
  result: number;
};

export type TargetNumberPayload = {
  best_result: number;
  expression: TargetNumberOp[];
  best_submitted_at: string;
};

export type ZeroInFeedback = "higher" | "lower" | "exact";
export type ZeroInGuess = {
  value: number;
  at: string;
  feedback: ZeroInFeedback;
};
export type ZeroInPayload = { guesses: ZeroInGuess[]; best_guess: number };

export type PlayerResult = {
  player_id: string;
  points: number;
  display: string;
};

/**
 * A puzzle as it may be sent to clients. Zero In's secret is withheld while the
 * round is active and only appears once it is finished — narrow with
 * `"secret" in puzzle`.
 */
export type PublicPuzzle =
  | { kind: "target_number"; target: number; bases: number[] }
  | { kind: "zero_in" }
  | { kind: "zero_in"; secret: number };

/** A round as the presenter slide and the play card need to see it. */
export type RoundLite = {
  id: string;
  agenda_item_id: string;
  kind: GameKind;
  puzzle: PublicPuzzle;
  ends_at: string;
  status: "active" | "finished";
};
