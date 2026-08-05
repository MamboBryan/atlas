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
