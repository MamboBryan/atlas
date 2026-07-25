import type { GameKind } from "./types";

export const ENABLED_GAMES: readonly GameKind[] = [
  "target_number",
  "zero_in",
] as const;

export function pickGame(rand: () => number = Math.random): GameKind {
  const i = Math.min(
    ENABLED_GAMES.length - 1,
    Math.floor(rand() * ENABLED_GAMES.length),
  );
  return ENABLED_GAMES[i];
}
