import { expect, test } from "vitest";
import { pickGame, ENABLED_GAMES } from "@/lib/games/select";
import type { GameKind } from "@/lib/games/types";

test("ENABLED_GAMES contains both games", () => {
  expect(ENABLED_GAMES).toContain<GameKind>("target_number");
  expect(ENABLED_GAMES).toContain<GameKind>("zero_in");
});

test("pickGame returns a member of ENABLED_GAMES", () => {
  for (let i = 0; i < 50; i++) {
    expect(ENABLED_GAMES).toContain(pickGame());
  }
});

test("pickGame with injected rand=0 returns first enabled game", () => {
  expect(pickGame(() => 0)).toBe(ENABLED_GAMES[0]);
});

test("pickGame with injected rand≈1 returns last enabled game", () => {
  expect(pickGame(() => 0.9999)).toBe(ENABLED_GAMES[ENABLED_GAMES.length - 1]);
});
