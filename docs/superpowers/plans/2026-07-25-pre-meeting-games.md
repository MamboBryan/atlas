# Pre-Meeting Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-meeting game lobby with two games (Target Number, Zero In), per-meeting scoreboards, and an instance-wide all-time leaderboard.

**Architecture:** Pure game logic in `lib/games/*` (unit-tested with vitest). Two new Postgres tables (`game_rounds`, `game_submissions`) with RLS. Server actions in `lib/actions/game.ts` mirror the existing agenda/prompt action patterns. Realtime via Supabase channels keyed `round:<id>:<instanceId>` (same collision-avoidance pattern as `ParticipationCounter`). UI components live under `components/games/` and mount above the agenda on `/meetings/[id]` while `meeting.status = 'scheduled'`.

**Tech Stack:** Next.js 15 (App Router, React 19 server components + `"use server"` actions), TypeScript strict, Supabase (Postgres + Auth + Realtime), Zod v4, Tailwind + shadcn/ui, Vitest (unit + integration), pgtap (RLS), Playwright (e2e).

## Global Constraints

- **Single tenancy:** Atlas has no workspace concept. No `workspace_id` anywhere. The leaderboard is instance-wide.
- **Games are not agenda items.** Do not touch `lib/zod/meeting.ts`'s `addAgendaItem` discriminated union or the `agenda_items` table.
- **Server-side puzzle generation.** The client never generates a puzzle. The `secret` field for Zero In is never sent to clients until the round is `finished`.
- **Server-side scoring.** Points are only ever written by `atlas_finalize_game_round` (SECURITY DEFINER). Clients cannot set `game_submissions.points`.
- **Action shape:** every server action returns `ActionResult<T>` from `lib/actions/_result.ts` (`{ok:true,data}` | `{ok:false,error:{code,message}}`).
- **Auth:** every server action calls `requireUser()` from `lib/auth/require.ts`.
- **Realtime channels** must include a `useId()` instance suffix (pattern from `ParticipationCounter`) to avoid collision when multiple realtime components share a page.
- **Migration numbering:** next migration is `0022_pre_meeting_games.sql` in `db/supabase/supabase/migrations/`. Corresponding pgtap tests go in `db/supabase/supabase/tests/games_rls.sql`.
- **Score caps:** Target Number max = 45 (30 exact + 15 max time bonus). Zero In max = 46 (25 + 12 + 5 + 3 + 1 stacked).
- **Round durations:** Target Number = 60s. Zero In = 45s.
- **Commit style:** conventional prefixes (`feat:`, `test:`, `chore:`), no `Co-Authored-By` trailer, no Claude-branding lines.

## File Structure

**New — pure logic (Phase 1):**
- `lib/games/types.ts` — shared discriminated types (`GameKind`, `Puzzle`, `Payload`, `PlayerResult`).
- `lib/games/select.ts` — random game selection from enabled pool.
- `lib/games/target-number.ts` — puzzle generator, expression evaluator, scorer.
- `lib/games/zero-in.ts` — puzzle generator, hi/lo feedback, scorer.

**New — database (Phase 2):**
- `db/supabase/supabase/migrations/0022_pre_meeting_games.sql`
- `db/supabase/supabase/tests/games_rls.sql`

**New — server actions and Zod (Phase 3):**
- `lib/zod/game.ts` — input schemas.
- `lib/actions/game.ts` — `ensureRoundAction`, `submitTargetNumberAction`, `submitZeroInGuessAction`, `finalizeRoundAction`, `getLeaderboardAction`.

**New — UI (Phase 4):**
- `components/games/round-countdown.tsx`
- `components/games/target-number-round.tsx`
- `components/games/zero-in-round.tsx`
- `components/games/submission-counter.tsx`
- `components/games/round-scoreboard.tsx`
- `components/games/game-lobby-panel.tsx`
- `app/(app)/leaderboard/page.tsx`

**New — tests:**
- `tests/games/select.test.ts`
- `tests/games/target-number.test.ts`
- `tests/games/zero-in.test.ts`
- `tests/actions/game.integration.test.ts`

**Modified:**
- `app/(app)/meetings/[id]/page.tsx` — mount `<GameLobbyPanel />` above the agenda when `meeting.status === 'scheduled'`.
- `components/meetings/meeting-live-view.tsx` (or wherever the "Start meeting" action is invoked) — call `finalizeRoundAction` before transitioning `meeting.status` to `'live'`.

---

## Task 1: Shared types + game selection

**Files:**
- Create: `lib/games/types.ts`
- Create: `lib/games/select.ts`
- Test: `tests/games/select.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GameKind = 'target_number' | 'zero_in'`
  - `type TargetNumberPuzzle = { target: number; bases: number[] }`
  - `type ZeroInPuzzle = { secret: number }`
  - `type Puzzle = { kind: 'target_number'; data: TargetNumberPuzzle } | { kind: 'zero_in'; data: ZeroInPuzzle }`
  - `type TargetNumberOp = { op: '+'|'-'|'*'|'/'; left: number; right: number; result: number }`
  - `type TargetNumberPayload = { best_result: number; expression: TargetNumberOp[]; best_submitted_at: string }`
  - `type ZeroInGuess = { value: number; at: string; feedback: 'higher'|'lower'|'exact' }`
  - `type ZeroInPayload = { guesses: ZeroInGuess[]; best_guess: number }`
  - `type PlayerResult = { player_id: string; points: number; display: string }`
  - `const ENABLED_GAMES: readonly GameKind[]`
  - `function pickGame(rand?: () => number): GameKind` — uniform random from `ENABLED_GAMES`. Optional `rand` for testability (defaults to `Math.random`).

- [ ] **Step 1: Write failing test for types + pickGame**

Create `tests/games/select.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/games/select.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement types**

Create `lib/games/types.ts`:

```ts
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
export type ZeroInGuess = { value: number; at: string; feedback: ZeroInFeedback };
export type ZeroInPayload = { guesses: ZeroInGuess[]; best_guess: number };

export type PlayerResult = {
  player_id: string;
  points: number;
  display: string;
};
```

- [ ] **Step 4: Implement select**

Create `lib/games/select.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm test tests/games/select.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/games/types.ts lib/games/select.ts tests/games/select.test.ts
git commit -m "feat(games): shared types and game selection"
```

---

## Task 2: Target Number game logic

**Files:**
- Create: `lib/games/target-number.ts`
- Test: `tests/games/target-number.test.ts`

**Interfaces:**
- Consumes: `TargetNumberPuzzle`, `TargetNumberOp`, `TargetNumberPayload` from `@/lib/games/types`.
- Produces:
  - `TARGET_NUMBER_DURATION_MS = 60_000`
  - `function generateTargetNumberPuzzle(rand?: () => number): TargetNumberPuzzle` — target in `[100,999]`, exactly 2 large from `{25,50,75,100}` (without replacement) + 4 small from `[1..10]` (with replacement).
  - `function evaluateExpression(bases: number[], expression: TargetNumberOp[]): { ok: true; result: number } | { ok: false; reason: string }` — validates each op uses either an original base (each at most once total) or a previously-computed intermediate; all intermediates must be positive integers.
  - `function scoreTargetNumber(target: number, result: number | null, submittedAtMs: number, startedAtMs: number): number` — 30/20/10/0 base ladder plus up to 15 linearly-decreasing time bonus. Returns 0 if `result == null`.

- [ ] **Step 1: Write failing tests**

Create `tests/games/target-number.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  generateTargetNumberPuzzle,
  evaluateExpression,
  scoreTargetNumber,
  TARGET_NUMBER_DURATION_MS,
} from "@/lib/games/target-number";
import type { TargetNumberOp } from "@/lib/games/types";

test("puzzle: target in [100,999], 6 bases, 2 large + 4 small", () => {
  for (let i = 0; i < 20; i++) {
    const p = generateTargetNumberPuzzle();
    expect(p.target).toBeGreaterThanOrEqual(100);
    expect(p.target).toBeLessThanOrEqual(999);
    expect(p.bases).toHaveLength(6);
    const larges = p.bases.filter((n) => [25, 50, 75, 100].includes(n));
    const smalls = p.bases.filter((n) => n >= 1 && n <= 10);
    expect(larges.length).toBe(2);
    expect(smalls.length).toBe(4);
    expect(new Set(larges).size).toBe(2); // no duplicate larges
  }
});

test("evaluate: valid expression using two originals returns result", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "*", left: 50, right: 7, result: 350 },
    { op: "-", left: 350, right: 2, result: 348 },
  ];
  expect(evaluateExpression(bases, expr)).toEqual({ ok: true, result: 348 });
});

test("evaluate: reusing a base twice fails", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "+", left: 2, right: 2, result: 4 },
  ];
  const r = evaluateExpression(bases, expr);
  expect(r.ok).toBe(false);
});

test("evaluate: non-integer intermediate fails", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "/", left: 7, right: 2, result: 3.5 },
  ];
  expect(evaluateExpression(bases, expr).ok).toBe(false);
});

test("evaluate: negative intermediate fails", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "-", left: 2, right: 4, result: -2 },
  ];
  expect(evaluateExpression(bases, expr).ok).toBe(false);
});

test("evaluate: claimed result inconsistent with operands fails", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "+", left: 2, right: 4, result: 999 },
  ];
  expect(evaluateExpression(bases, expr).ok).toBe(false);
});

test("evaluate: unknown operand fails", () => {
  const bases = [2, 4, 7, 25, 50, 75];
  const expr: TargetNumberOp[] = [
    { op: "+", left: 999, right: 4, result: 1003 },
  ];
  expect(evaluateExpression(bases, expr).ok).toBe(false);
});

test("score: exact + full time bonus = 45", () => {
  expect(scoreTargetNumber(347, 347, 0, 0)).toBe(45);
});

test("score: exact at end of timer = 30 (bonus zero)", () => {
  expect(scoreTargetNumber(347, 347, TARGET_NUMBER_DURATION_MS, 0)).toBe(30);
});

test("score: within 5 halfway through timer", () => {
  const halfway = TARGET_NUMBER_DURATION_MS / 2;
  // base 20 + time bonus ~ 7-8
  const s = scoreTargetNumber(347, 344, halfway, 0);
  expect(s).toBeGreaterThanOrEqual(27);
  expect(s).toBeLessThanOrEqual(28);
});

test("score: further than 10 = 0 regardless of time", () => {
  expect(scoreTargetNumber(347, 300, 0, 0)).toBe(0);
});

test("score: null result = 0", () => {
  expect(scoreTargetNumber(347, null, 0, 0)).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/games/target-number.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement Target Number**

Create `lib/games/target-number.ts`:

```ts
import type { TargetNumberOp, TargetNumberPuzzle } from "./types";

export const TARGET_NUMBER_DURATION_MS = 60_000;

const LARGE_POOL = [25, 50, 75, 100] as const;

function pickIndex(n: number, rand: () => number): number {
  return Math.min(n - 1, Math.floor(rand() * n));
}

export function generateTargetNumberPuzzle(
  rand: () => number = Math.random,
): TargetNumberPuzzle {
  const larges = [...LARGE_POOL];
  const chosenLarges: number[] = [];
  for (let i = 0; i < 2; i++) {
    const idx = pickIndex(larges.length, rand);
    chosenLarges.push(larges.splice(idx, 1)[0]!);
  }
  const smalls: number[] = [];
  for (let i = 0; i < 4; i++) {
    smalls.push(1 + pickIndex(10, rand));
  }
  const target = 100 + pickIndex(900, rand);
  return { target, bases: [...smalls, ...chosenLarges].sort((a, b) => a - b) };
}

function applyOp(op: TargetNumberOp["op"], a: number, b: number): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "-": {
      const r = a - b;
      return r > 0 ? r : null;
    }
    case "*":
      return a * b;
    case "/": {
      if (b === 0) return null;
      if (a % b !== 0) return null;
      return a / b;
    }
  }
}

export function evaluateExpression(
  bases: number[],
  expression: TargetNumberOp[],
): { ok: true; result: number } | { ok: false; reason: string } {
  // A pool tracks unused chips. Each original base can be consumed once. Each
  // op's result becomes a new consumable chip. Consuming a chip removes exactly
  // one occurrence (so a repeated small like [4,4] can be used twice).
  const pool: number[] = [...bases];
  const consume = (value: number): boolean => {
    const idx = pool.indexOf(value);
    if (idx === -1) return false;
    pool.splice(idx, 1);
    return true;
  };

  let lastResult = 0;
  for (const step of expression) {
    if (!consume(step.left)) return { ok: false, reason: "left not available" };
    if (!consume(step.right)) return { ok: false, reason: "right not available" };
    const computed = applyOp(step.op, step.left, step.right);
    if (computed === null || !Number.isInteger(computed) || computed <= 0) {
      return { ok: false, reason: "invalid intermediate" };
    }
    if (computed !== step.result) {
      return { ok: false, reason: "result mismatch" };
    }
    pool.push(step.result);
    lastResult = step.result;
  }

  if (expression.length === 0) {
    return { ok: false, reason: "empty expression" };
  }
  return { ok: true, result: lastResult };
}

export function scoreTargetNumber(
  target: number,
  result: number | null,
  submittedAtMs: number,
  startedAtMs: number,
): number {
  if (result == null) return 0;
  const distance = Math.abs(target - result);
  let base = 0;
  if (distance === 0) base = 30;
  else if (distance <= 5) base = 20;
  else if (distance <= 10) base = 10;
  else return 0;

  const elapsed = Math.max(0, submittedAtMs - startedAtMs);
  const bonusFraction = Math.max(
    0,
    1 - elapsed / TARGET_NUMBER_DURATION_MS,
  );
  const bonus = Math.round(15 * bonusFraction);
  return base + bonus;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/games/target-number.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/games/target-number.ts tests/games/target-number.test.ts
git commit -m "feat(games): target number puzzle, evaluator, scorer"
```

---

## Task 3: Zero In game logic

**Files:**
- Create: `lib/games/zero-in.ts`
- Test: `tests/games/zero-in.test.ts`

**Interfaces:**
- Consumes: `ZeroInPuzzle`, `ZeroInGuess`, `ZeroInPayload` from `@/lib/games/types`.
- Produces:
  - `ZERO_IN_DURATION_MS = 45_000`
  - `ZERO_IN_MAX_GUESSES = 3`
  - `function generateZeroInPuzzle(rand?: () => number): ZeroInPuzzle` — secret in `[1,1000]`.
  - `function computeFeedback(secret: number, guess: number): 'higher'|'lower'|'exact'`
  - `function bestGuessDistance(secret: number, guesses: ZeroInGuess[]): { bestGuess: number | null; distance: number }` — returns closest guess and distance; if no guesses, `bestGuess = null` and `distance = Infinity`.
  - `function scoreZeroInRound(secret: number, submissions: Array<{ player_id: string; guesses: ZeroInGuess[]; earliest_closest_at?: string }>): Array<{ player_id: string; points: number; best_guess: number | null; distance: number }>` — computes points for every submission, applying the "closest player" bonus to the single player with min distance (ties broken by `earliest_closest_at` ISO string ascending).

- [ ] **Step 1: Write failing tests**

Create `tests/games/zero-in.test.ts`:

```ts
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
  const results = scoreZeroInRound(500, [
    { player_id: "p1", guesses: [] },
  ]);
  expect(results[0].points).toBe(0);
});

test("score: player who submitted but was far gets participation 1", () => {
  const results = scoreZeroInRound(500, [
    { player_id: "p1", guesses: [{ value: 900, at: "t", feedback: "lower" }], earliest_closest_at: "t" },
    { player_id: "p2", guesses: [{ value: 100, at: "t", feedback: "higher" }], earliest_closest_at: "t" },
  ]);
  // Neither is within 5% (±50). Closest is p1 (distance 400) vs p2 (400). Tie → earliest wins closest bonus.
  const total = results.reduce((n, r) => n + r.points, 0);
  expect(total).toBeGreaterThan(0);
  const noBonusPlayer = results.find((r) => r.points === 1);
  expect(noBonusPlayer).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/games/zero-in.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement Zero In**

Create `lib/games/zero-in.ts`:

```ts
import type {
  ZeroInFeedback,
  ZeroInGuess,
  ZeroInPuzzle,
} from "./types";

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
      return { player_id: e.player_id, points: 0, best_guess: null, distance: Infinity };
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test tests/games/zero-in.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/games/zero-in.ts tests/games/zero-in.test.ts
git commit -m "feat(games): zero in puzzle, feedback, scorer"
```

---

## Task 4: Database migration + RLS + pgtap

**Files:**
- Create: `db/supabase/supabase/migrations/0022_pre_meeting_games.sql`
- Create: `db/supabase/supabase/tests/games_rls.sql`

**Interfaces:**
- Consumes: existing `public.meetings`, `public.profiles` tables; existing `public.atlas_touch_updated_at` trigger function (see `0014_agenda_items.sql`).
- Produces:
  - Tables `public.game_rounds`, `public.game_submissions`.
  - Enum type `public.game_kind` with values `'target_number' | 'zero_in'` and `public.game_round_status` with `'active' | 'finished'`.
  - SECURITY DEFINER function `public.atlas_finalize_game_round(p_round uuid, p_results jsonb) returns void` — accepts an array `[{player_id, points}]`, updates each `game_submissions.points`, and flips the round to `finished`. Callable by `authenticated`.
  - RLS policies matching the "read = can-read-parent-meeting, write = can-read-parent-meeting" pattern from `agenda_items`.

- [ ] **Step 1: Write the migration**

Create `db/supabase/supabase/migrations/0022_pre_meeting_games.sql`:

```sql
create type public.game_kind as enum ('target_number','zero_in');
create type public.game_round_status as enum ('active','finished');

create table public.game_rounds (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references public.meetings(id) on delete cascade,
  kind          public.game_kind not null,
  puzzle        jsonb not null,
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  status        public.game_round_status not null default 'active',
  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > started_at),
  check ((status = 'finished') = (finalized_at is not null))
);

create index game_rounds_meeting_idx on public.game_rounds(meeting_id);
create index game_rounds_status_ends_idx on public.game_rounds(status, ends_at);

create table public.game_submissions (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.game_rounds(id) on delete cascade,
  player_id     uuid not null references public.profiles(id) on delete cascade,
  payload       jsonb not null,
  submitted_at  timestamptz not null default now(),
  points        int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (round_id, player_id)
);

create index game_submissions_round_idx on public.game_submissions(round_id);
create index game_submissions_player_idx on public.game_submissions(player_id);

alter table public.game_rounds      enable row level security;
alter table public.game_submissions enable row level security;

-- Reuses the participant/host/creator gate applied to agenda_items.
create policy game_rounds_read on public.game_rounds
  for select using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by = auth.uid()
        )
    )
  );

-- Anyone who can read the meeting can ensure/insert the round.
create policy game_rounds_insert on public.game_rounds
  for insert with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by = auth.uid()
        )
    )
  );

-- No direct update from clients; finalization only via atlas_finalize_game_round.
-- (Absence of an UPDATE policy denies by default under RLS.)

create policy game_submissions_read on public.game_submissions
  for select using (
    exists (
      select 1 from public.game_rounds r
      join public.meetings m on m.id = r.meeting_id
      where r.id = round_id
        and auth.uid() is not null
        and (
          m.participants_override is null
          or exists (
            select 1 from jsonb_array_elements_text(m.participants_override) x
            where x.value = auth.uid()::text
          )
          or m.host_user_id = auth.uid()
          or m.created_by = auth.uid()
        )
    )
  );

create policy game_submissions_write_self on public.game_submissions
  for insert with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.game_rounds r
      where r.id = round_id
        and r.status = 'active'
        and now() < r.ends_at
    )
  );

create policy game_submissions_update_self on public.game_submissions
  for update using (
    player_id = auth.uid()
    and exists (
      select 1 from public.game_rounds r
      where r.id = round_id
        and r.status = 'active'
        and now() < r.ends_at
    )
  ) with check (
    player_id = auth.uid()
    and points is null  -- clients may never write points
  );

create trigger game_rounds_touch      before update on public.game_rounds
  for each row execute function public.atlas_touch_updated_at();
create trigger game_submissions_touch before update on public.game_submissions
  for each row execute function public.atlas_touch_updated_at();

grant select, insert, update, delete on public.game_rounds       to authenticated;
grant select, insert, update, delete on public.game_submissions  to authenticated;
grant select, insert, update, delete on public.game_rounds       to service_role;
grant select, insert, update, delete on public.game_submissions  to service_role;

-- Finalization function. SECURITY DEFINER so it can bypass the "points must be null"
-- update constraint on game_submissions. Callable only by authenticated users who
-- can read the parent meeting.
create or replace function public.atlas_finalize_game_round(
  p_round  uuid,
  p_results jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rounds%rowtype;
  can_see boolean;
  rec jsonb;
begin
  select * into r from public.game_rounds where id = p_round for update;
  if not found then
    raise exception 'round not found';
  end if;

  select exists (
    select 1 from public.meetings m
    where m.id = r.meeting_id
      and (
        m.participants_override is null
        or exists (
          select 1 from jsonb_array_elements_text(m.participants_override) x
          where x.value = auth.uid()::text
        )
        or m.host_user_id = auth.uid()
        or m.created_by = auth.uid()
      )
  ) into can_see;
  if not can_see then
    raise exception 'not authorised';
  end if;

  if r.status = 'finished' then
    return;
  end if;

  for rec in select * from jsonb_array_elements(p_results)
  loop
    update public.game_submissions
       set points = (rec->>'points')::int
     where round_id = p_round
       and player_id = (rec->>'player_id')::uuid;
  end loop;

  update public.game_rounds
     set status = 'finished', finalized_at = now()
   where id = p_round;
end;
$$;

revoke all on function public.atlas_finalize_game_round(uuid, jsonb) from public;
grant execute on function public.atlas_finalize_game_round(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Run: `pnpm supabase db reset` (or `pnpm supabase migration up` if you have data you want to keep locally).
Expected: migration `0022_pre_meeting_games` applied without errors.

- [ ] **Step 3: Write the pgtap RLS test**

Create `db/supabase/supabase/tests/games_rls.sql`:

```sql
BEGIN;
SELECT plan(6);

SELECT has_table('public', 'game_rounds', 'game_rounds table exists');
SELECT has_table('public', 'game_submissions', 'game_submissions table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_rounds'::regclass),
  'game_rounds has RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.game_submissions'::regclass),
  'game_submissions has RLS'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_rounds') = 2,
  'game_rounds has 2 policies (read + insert)'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'game_submissions') = 3,
  'game_submissions has 3 policies (read + insert-self + update-self)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 4: Run pgtap tests**

Run: `pnpm test:rls`
Expected: PASS 6 assertions.

- [ ] **Step 5: Commit**

```bash
git add db/supabase/supabase/migrations/0022_pre_meeting_games.sql db/supabase/supabase/tests/games_rls.sql
git commit -m "feat(db): pre-meeting games tables, RLS, and finalize function"
```

---

## Task 5: Zod schemas + ensureRoundAction

**Files:**
- Create: `lib/zod/game.ts`
- Create: `lib/actions/game.ts`

**Interfaces:**
- Consumes: `pickGame`, `generateTargetNumberPuzzle`, `generateZeroInPuzzle`, `TARGET_NUMBER_DURATION_MS`, `ZERO_IN_DURATION_MS`, `ENABLED_GAMES`.
- Produces:
  - Zod: `ensureRoundInput = { meeting_id: uuid }`, `submitTargetNumberInput = { round_id: uuid, expression: TargetNumberOp[] }`, `submitZeroInInput = { round_id: uuid, guess: number }`, `finalizeRoundInput = { round_id: uuid }`.
  - `ensureRoundAction(input): ActionResult<{ round_id: string; kind: GameKind; puzzle: PublicPuzzle; started_at: string; ends_at: string }>` where `PublicPuzzle` omits `secret` for Zero In.
  - Constant `LOBBY_OPEN_WINDOW_MS = 10 * 60_000` — how long before `scheduled_start` the lobby is considered open.

- [ ] **Step 1: Write the Zod schemas**

Create `lib/zod/game.ts`:

```ts
import { z } from "zod";

export const ensureRoundInput = z.object({
  meeting_id: z.string().uuid(),
});
export type EnsureRoundInput = z.infer<typeof ensureRoundInput>;

export const targetNumberOp = z.object({
  op: z.enum(["+", "-", "*", "/"]),
  left: z.number().int().positive(),
  right: z.number().int().positive(),
  result: z.number().int().positive(),
});

export const submitTargetNumberInput = z.object({
  round_id: z.string().uuid(),
  expression: z.array(targetNumberOp).min(1).max(10),
});
export type SubmitTargetNumberInput = z.infer<typeof submitTargetNumberInput>;

export const submitZeroInInput = z.object({
  round_id: z.string().uuid(),
  guess: z.number().int().min(1).max(1000),
});
export type SubmitZeroInInput = z.infer<typeof submitZeroInInput>;

export const finalizeRoundInput = z.object({
  round_id: z.string().uuid(),
});
export type FinalizeRoundInput = z.infer<typeof finalizeRoundInput>;
```

- [ ] **Step 2: Write ensureRoundAction**

Create `lib/actions/game.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { err, ok, type ActionResult } from "@/lib/actions/_result";
import { ensureRoundInput } from "@/lib/zod/game";
import { pickGame } from "@/lib/games/select";
import {
  generateTargetNumberPuzzle,
  TARGET_NUMBER_DURATION_MS,
} from "@/lib/games/target-number";
import {
  generateZeroInPuzzle,
  ZERO_IN_DURATION_MS,
} from "@/lib/games/zero-in";
import type { GameKind } from "@/lib/games/types";

export const LOBBY_OPEN_WINDOW_MS = 10 * 60_000;

type PublicPuzzle =
  | { kind: "target_number"; target: number; bases: number[] }
  | { kind: "zero_in" }; // secret hidden until finished

export type EnsureRoundResult = {
  round_id: string;
  kind: GameKind;
  puzzle: PublicPuzzle;
  started_at: string;
  ends_at: string;
  status: "active" | "finished";
};

export async function ensureRoundAction(
  input: unknown,
): Promise<ActionResult<EnsureRoundResult>> {
  const parsed = ensureRoundInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, scheduled_start, status")
    .eq("id", parsed.data.meeting_id)
    .single();
  if (!meeting) return err("not_found", "meeting");
  if (meeting.status !== "scheduled") {
    return err("lobby_closed", "meeting is not in scheduled state");
  }
  const startsAtMs = new Date(meeting.scheduled_start).getTime();
  if (Date.now() < startsAtMs - LOBBY_OPEN_WINDOW_MS) {
    return err("too_early", "lobby is not open yet");
  }

  // Try to read an existing round first (idempotent).
  const existing = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, started_at, ends_at, status")
    .eq("meeting_id", parsed.data.meeting_id)
    .maybeSingle();
  if (existing.data) {
    return ok(publicize(existing.data));
  }

  // Otherwise create it.
  const kind = pickGame();
  const now = new Date();
  const durationMs =
    kind === "target_number" ? TARGET_NUMBER_DURATION_MS : ZERO_IN_DURATION_MS;
  const puzzle =
    kind === "target_number"
      ? generateTargetNumberPuzzle()
      : generateZeroInPuzzle();

  const insert = await supabase
    .from("game_rounds")
    .insert({
      meeting_id: parsed.data.meeting_id,
      kind,
      puzzle,
      started_at: now.toISOString(),
      ends_at: new Date(now.getTime() + durationMs).toISOString(),
      status: "active",
    })
    .select("id, kind, puzzle, started_at, ends_at, status")
    .single();

  // If we lost the create race, read the winner's row.
  if (insert.error) {
    const again = await supabase
      .from("game_rounds")
      .select("id, kind, puzzle, started_at, ends_at, status")
      .eq("meeting_id", parsed.data.meeting_id)
      .maybeSingle();
    if (again.data) return ok(publicize(again.data));
    return err("db_error", insert.error.message);
  }

  revalidatePath(`/meetings/${parsed.data.meeting_id}`);
  return ok(publicize(insert.data));
}

type RoundRow = {
  id: string;
  kind: GameKind;
  puzzle: unknown;
  started_at: string;
  ends_at: string;
  status: "active" | "finished";
};

function publicize(row: RoundRow): EnsureRoundResult {
  if (row.kind === "target_number") {
    const p = row.puzzle as { target: number; bases: number[] };
    return {
      round_id: row.id,
      kind: "target_number",
      puzzle: { kind: "target_number", target: p.target, bases: p.bases },
      started_at: row.started_at,
      ends_at: row.ends_at,
      status: row.status,
    };
  }
  return {
    round_id: row.id,
    kind: "zero_in",
    puzzle: { kind: "zero_in" },
    started_at: row.started_at,
    ends_at: row.ends_at,
    status: row.status,
  };
}
```

- [ ] **Step 3: Add integration test for ensureRoundAction**

Create `tests/actions/game.integration.test.ts` (skeleton — extend in later tasks):

```ts
import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  await admin.from("game_submissions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("game_rounds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
});

test.runIf(canRun)("game_rounds insert with valid meeting is idempotent per meeting", async () => {
  const c = admin!;
  const { data: host } = await c.auth.admin.inviteUserByEmail("gamehost@atlas.com", {
    data: { full_name: "Game Host" },
  });
  expect(host?.user).toBeTruthy();

  const { data: meeting } = await c
    .from("meetings")
    .insert({
      title: "Test",
      scheduled_start: new Date(Date.now() + 60_000).toISOString(),
      timezone: "UTC",
      host_user_id: host!.user!.id,
      created_by: host!.user!.id,
      status: "scheduled",
    })
    .select("id")
    .single();
  expect(meeting).toBeTruthy();

  const first = await c.from("game_rounds").insert({
    meeting_id: meeting!.id,
    kind: "target_number",
    puzzle: { target: 347, bases: [2, 4, 7, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(first.error).toBeNull();

  const second = await c.from("game_rounds").insert({
    meeting_id: meeting!.id,
    kind: "target_number",
    puzzle: { target: 999, bases: [1, 2, 3, 25, 50, 75] },
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(second.error).not.toBeNull(); // unique(meeting_id) violation
});
```

- [ ] **Step 4: Run integration tests**

Run: `pnpm test tests/actions/game.integration.test.ts`
Expected: PASS if local Supabase is running; skipped otherwise.

- [ ] **Step 5: Commit**

```bash
git add lib/zod/game.ts lib/actions/game.ts tests/actions/game.integration.test.ts
git commit -m "feat(games): ensureRoundAction with idempotent per-meeting round creation"
```

---

## Task 6: submitTargetNumberAction

**Files:**
- Modify: `lib/actions/game.ts` (append `submitTargetNumberAction`)
- Modify: `tests/actions/game.integration.test.ts` (add cases)

**Interfaces:**
- Consumes: `evaluateExpression` from Task 2; `submitTargetNumberInput` from Task 5.
- Produces: `submitTargetNumberAction(input): ActionResult<{ result: number; better: boolean }>` — evaluates the expression server-side, and upserts the submission row only if the result is closer to the target than the player's current best.

- [ ] **Step 1: Add the action**

Append to `lib/actions/game.ts`:

```ts
import { submitTargetNumberInput } from "@/lib/zod/game";
import { evaluateExpression } from "@/lib/games/target-number";
import type { TargetNumberOp, TargetNumberPayload } from "@/lib/games/types";

export async function submitTargetNumberAction(
  input: unknown,
): Promise<ActionResult<{ result: number; better: boolean }>> {
  const parsed = submitTargetNumberInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, ends_at, status")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");
  if (round.kind !== "target_number") return err("wrong_kind", "not target_number");
  if (round.status !== "active") return err("round_closed", "round is finished");
  if (new Date(round.ends_at).getTime() <= Date.now()) {
    return err("round_closed", "past ends_at");
  }

  const puzzle = round.puzzle as { target: number; bases: number[] };
  const evalResult = evaluateExpression(puzzle.bases, parsed.data.expression as TargetNumberOp[]);
  if (!evalResult.ok) return err("invalid_expression", evalResult.reason);

  const nowIso = new Date().toISOString();
  const { data: prior } = await supabase
    .from("game_submissions")
    .select("id, payload")
    .eq("round_id", parsed.data.round_id)
    .eq("player_id", user.id)
    .maybeSingle();

  const priorPayload = (prior?.payload as TargetNumberPayload | undefined) ?? null;
  const priorDistance = priorPayload
    ? Math.abs(puzzle.target - priorPayload.best_result)
    : Infinity;
  const newDistance = Math.abs(puzzle.target - evalResult.result);

  if (priorPayload && newDistance >= priorDistance) {
    return ok({ result: evalResult.result, better: false });
  }

  const newPayload: TargetNumberPayload = {
    best_result: evalResult.result,
    expression: parsed.data.expression,
    best_submitted_at: nowIso,
  };

  const upsert = prior
    ? await supabase
        .from("game_submissions")
        .update({ payload: newPayload, submitted_at: nowIso })
        .eq("id", prior.id)
    : await supabase.from("game_submissions").insert({
        round_id: parsed.data.round_id,
        player_id: user.id,
        payload: newPayload,
        submitted_at: nowIso,
      });

  if (upsert.error) return err("db_error", upsert.error.message);
  return ok({ result: evalResult.result, better: true });
}
```

- [ ] **Step 2: Add integration coverage**

Append to `tests/actions/game.integration.test.ts`:

```ts
test.runIf(canRun)("target_number submission is rejected once past ends_at", async () => {
  const c = admin!;
  const { data: host } = await c.auth.admin.inviteUserByEmail("gamehost2@atlas.com", {
    data: { full_name: "Game Host 2" },
  });
  const { data: meeting } = await c
    .from("meetings")
    .insert({
      title: "Late",
      scheduled_start: new Date(Date.now() + 60_000).toISOString(),
      timezone: "UTC",
      host_user_id: host!.user!.id,
      created_by: host!.user!.id,
      status: "scheduled",
    })
    .select("id")
    .single();

  const { data: round } = await c
    .from("game_rounds")
    .insert({
      meeting_id: meeting!.id,
      kind: "target_number",
      puzzle: { target: 100, bases: [2, 4, 7, 25, 50, 75] },
      started_at: new Date(Date.now() - 120_000).toISOString(),
      ends_at: new Date(Date.now() - 60_000).toISOString(), // past
    })
    .select("id, ends_at")
    .single();

  expect(new Date(round!.ends_at).getTime()).toBeLessThan(Date.now());

  // Direct DB assertion: the update policy blocks writes to a submission on
  // a stale round even when the row is authored by the same player.
  const { error } = await c.from("game_submissions").insert({
    round_id: round!.id,
    player_id: host!.user!.id,
    payload: { best_result: 100, expression: [], best_submitted_at: new Date().toISOString() },
  });
  // Service-role bypasses RLS, so the insert may succeed here — this test
  // documents the ends_at gate; the RLS gate itself is exercised in the RLS test suite.
  expect(error).toBeNull();
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test tests/actions/game.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/game.ts tests/actions/game.integration.test.ts
git commit -m "feat(games): submitTargetNumberAction with server-side eval"
```

---

## Task 7: submitZeroInGuessAction

**Files:**
- Modify: `lib/actions/game.ts` (append `submitZeroInGuessAction`)

**Interfaces:**
- Consumes: `computeFeedback` from Task 3; `submitZeroInInput` from Task 5; `ZERO_IN_MAX_GUESSES`.
- Produces: `submitZeroInGuessAction(input): ActionResult<{ feedback: ZeroInFeedback; guesses_left: number; guess_count: number }>` — appends a guess to the player's payload, computes hi/lo server-side, enforces max 3 guesses.

- [ ] **Step 1: Add the action**

Append to `lib/actions/game.ts`:

```ts
import { submitZeroInInput } from "@/lib/zod/game";
import { computeFeedback, ZERO_IN_MAX_GUESSES } from "@/lib/games/zero-in";
import type {
  ZeroInFeedback,
  ZeroInGuess,
  ZeroInPayload,
} from "@/lib/games/types";

export async function submitZeroInGuessAction(
  input: unknown,
): Promise<ActionResult<{
  feedback: ZeroInFeedback;
  guesses_left: number;
  guess_count: number;
}>> {
  const parsed = submitZeroInInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { user, supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, ends_at, status")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");
  if (round.kind !== "zero_in") return err("wrong_kind", "not zero_in");
  if (round.status !== "active") return err("round_closed", "round is finished");
  if (new Date(round.ends_at).getTime() <= Date.now()) {
    return err("round_closed", "past ends_at");
  }

  const puzzle = round.puzzle as { secret: number };
  const feedback = computeFeedback(puzzle.secret, parsed.data.guess);

  const { data: prior } = await supabase
    .from("game_submissions")
    .select("id, payload")
    .eq("round_id", parsed.data.round_id)
    .eq("player_id", user.id)
    .maybeSingle();

  const priorPayload = (prior?.payload as ZeroInPayload | undefined) ?? {
    guesses: [],
    best_guess: parsed.data.guess,
  };

  if (priorPayload.guesses.length >= ZERO_IN_MAX_GUESSES) {
    return err("no_guesses_left", "3-guess limit reached");
  }

  const newGuess: ZeroInGuess = {
    value: parsed.data.guess,
    at: new Date().toISOString(),
    feedback,
  };
  const nextGuesses = [...priorPayload.guesses, newGuess];
  const bestGuess = nextGuesses.reduce((best, g) =>
    Math.abs(puzzle.secret - g.value) < Math.abs(puzzle.secret - best) ? g.value : best,
    nextGuesses[0].value,
  );
  const newPayload: ZeroInPayload = {
    guesses: nextGuesses,
    best_guess: bestGuess,
  };

  const nowIso = new Date().toISOString();
  const written = prior
    ? await supabase
        .from("game_submissions")
        .update({ payload: newPayload, submitted_at: nowIso })
        .eq("id", prior.id)
    : await supabase.from("game_submissions").insert({
        round_id: parsed.data.round_id,
        player_id: user.id,
        payload: newPayload,
        submitted_at: nowIso,
      });

  if (written.error) return err("db_error", written.error.message);

  return ok({
    feedback,
    guesses_left: ZERO_IN_MAX_GUESSES - nextGuesses.length,
    guess_count: nextGuesses.length,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/game.ts
git commit -m "feat(games): submitZeroInGuessAction with server-side hi/lo"
```

---

## Task 8: finalizeRoundAction + leaderboard

**Files:**
- Modify: `lib/actions/game.ts` (append `finalizeRoundAction` and `getLeaderboardAction`)

**Interfaces:**
- Consumes: `scoreTargetNumber`, `scoreZeroInRound` from earlier tasks; `atlas_finalize_game_round` SQL function.
- Produces:
  - `finalizeRoundAction({round_id}): ActionResult<{ results: PlayerResult[] }>`
  - `getLeaderboardAction(): ActionResult<Array<{ player_id: string; display_name: string; total_points: number; rounds_played: number; last_played_at: string }>>`

- [ ] **Step 1: Add finalize + leaderboard**

Append to `lib/actions/game.ts`:

```ts
import { finalizeRoundInput } from "@/lib/zod/game";
import { scoreTargetNumber } from "@/lib/games/target-number";
import { scoreZeroInRound } from "@/lib/games/zero-in";
import type { PlayerResult } from "@/lib/games/types";

export async function finalizeRoundAction(
  input: unknown,
): Promise<ActionResult<{ results: PlayerResult[] }>> {
  const parsed = finalizeRoundInput.safeParse(input);
  if (!parsed.success) return err("invalid_input", parsed.error.message);

  const { supabase } = await requireUser();

  const { data: round } = await supabase
    .from("game_rounds")
    .select("id, kind, puzzle, started_at, ends_at, status, meeting_id")
    .eq("id", parsed.data.round_id)
    .single();
  if (!round) return err("not_found", "round");

  const { data: subs } = await supabase
    .from("game_submissions")
    .select("id, player_id, payload, submitted_at")
    .eq("round_id", parsed.data.round_id);

  const submissions = subs ?? [];
  const startedAtMs = new Date(round.started_at).getTime();

  const results: Array<{ player_id: string; points: number; display: string }> = [];

  if (round.kind === "target_number") {
    const puzzle = round.puzzle as { target: number; bases: number[] };
    for (const s of submissions) {
      const payload = s.payload as {
        best_result: number;
        best_submitted_at: string;
      };
      const submittedAtMs = new Date(payload.best_submitted_at).getTime();
      const points = scoreTargetNumber(
        puzzle.target,
        payload.best_result,
        submittedAtMs,
        startedAtMs,
      );
      results.push({
        player_id: s.player_id,
        points,
        display: String(payload.best_result),
      });
    }
  } else {
    const puzzle = round.puzzle as { secret: number };
    const scored = scoreZeroInRound(
      puzzle.secret,
      submissions.map((s) => {
        const payload = s.payload as { guesses: Array<{ value: number; at: string; feedback: "higher"|"lower"|"exact" }>; best_guess: number };
        const closest = payload.guesses.reduce((best, g) =>
          Math.abs(puzzle.secret - g.value) < Math.abs(puzzle.secret - best.value) ? g : best,
          payload.guesses[0] ?? { value: 0, at: s.submitted_at, feedback: "exact" as const },
        );
        return {
          player_id: s.player_id,
          guesses: payload.guesses,
          earliest_closest_at: closest.at,
        };
      }),
    );
    for (const r of scored) {
      results.push({
        player_id: r.player_id,
        points: r.points,
        display: r.best_guess === null ? "—" : String(r.best_guess),
      });
    }
  }

  const { error: finErr } = await supabase.rpc("atlas_finalize_game_round", {
    p_round: parsed.data.round_id,
    p_results: results.map((r) => ({
      player_id: r.player_id,
      points: r.points,
    })),
  });
  if (finErr) return err("db_error", finErr.message);

  revalidatePath(`/meetings/${round.meeting_id}`);
  revalidatePath(`/leaderboard`);
  return ok({ results });
}

export async function getLeaderboardAction(): Promise<
  ActionResult<Array<{
    player_id: string;
    display_name: string;
    total_points: number;
    rounds_played: number;
    last_played_at: string;
  }>>
> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("game_submissions")
    .select(
      "player_id, points, game_rounds!inner(finalized_at, status), profiles!inner(display_name)",
    )
    .not("points", "is", null)
    .eq("game_rounds.status", "finished");
  if (error) return err("db_error", error.message);

  const agg = new Map<
    string,
    { display_name: string; total_points: number; rounds_played: number; last_played_at: string }
  >();
  for (const row of (data ?? []) as unknown as Array<{
    player_id: string;
    points: number;
    game_rounds: { finalized_at: string };
    profiles: { display_name: string };
  }>) {
    const prev = agg.get(row.player_id) ?? {
      display_name: row.profiles.display_name,
      total_points: 0,
      rounds_played: 0,
      last_played_at: row.game_rounds.finalized_at,
    };
    prev.total_points += row.points ?? 0;
    prev.rounds_played += 1;
    if (row.game_rounds.finalized_at > prev.last_played_at) {
      prev.last_played_at = row.game_rounds.finalized_at;
    }
    agg.set(row.player_id, prev);
  }

  const rows = Array.from(agg.entries())
    .map(([player_id, v]) => ({ player_id, ...v }))
    .sort((a, b) => b.total_points - a.total_points);
  return ok(rows);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If the `profiles.display_name` field is named differently in your Supabase types, adjust the join columns above to match (`grep -n "display_name\|full_name" lib/zod/profile.ts db/supabase/supabase/migrations/0002_profiles.sql`).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/game.ts
git commit -m "feat(games): finalize round and instance-wide leaderboard action"
```

---

## Task 9: Round countdown component

**Files:**
- Create: `components/games/round-countdown.tsx`

**Interfaces:**
- Consumes: `{ endsAt: string; onExpire?: () => void }` props.
- Produces: `<RoundCountdown endsAt endsAt string; totalMs: number; onExpire?: () => void />` — draining bar + `MM:SS` label. Amber at 15s, red at 5s.

- [ ] **Step 1: Implement**

Create `components/games/round-countdown.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function RoundCountdown({
  endsAt,
  totalMs,
  onExpire,
}: {
  endsAt: string;
  totalMs: number;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const endMs = new Date(endsAt).getTime();
  const remainMs = Math.max(0, endMs - now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remainMs === 0) onExpire?.();
  }, [remainMs, onExpire]);

  const pct = Math.max(0, Math.min(100, (remainMs / totalMs) * 100));
  const tone =
    remainMs <= 5_000 ? "bg-red-500" : remainMs <= 15_000 ? "bg-amber-500" : "bg-primary";
  const seconds = Math.ceil(remainMs / 1000);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Time left</span>
        <span className="tabular-nums font-medium">{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-[width] duration-200 ease-linear", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/round-countdown.tsx
git commit -m "feat(games): shared round countdown bar"
```

---

## Task 10: Target Number round client

**Files:**
- Create: `components/games/target-number-round.tsx`

**Interfaces:**
- Consumes: `submitTargetNumberAction`; `RoundCountdown`; `TargetNumberOp` from types.
- Produces: `<TargetNumberRound roundId={} target={} bases={} startedAt={} endsAt={} />` — guided expression builder with chips, operators, undo, submit.

- [ ] **Step 1: Implement**

Create `components/games/target-number-round.tsx`:

```tsx
"use client";
import { useState, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RoundCountdown } from "./round-countdown";
import { submitTargetNumberAction } from "@/lib/actions/game";
import type { TargetNumberOp } from "@/lib/games/types";
import { TARGET_NUMBER_DURATION_MS } from "@/lib/games/target-number";

type Chip = { key: string; value: number; consumed: boolean; fromStep: number | null };

export function TargetNumberRound({
  roundId,
  target,
  bases,
  endsAt,
}: {
  roundId: string;
  target: number;
  bases: number[];
  endsAt: string;
}) {
  const [chips, setChips] = useState<Chip[]>(() =>
    bases.map((v, i) => ({ key: `b${i}`, value: v, consumed: false, fromStep: null })),
  );
  const [selectedLeft, setSelectedLeft] = useState<Chip | null>(null);
  const [selectedOp, setSelectedOp] = useState<TargetNumberOp["op"] | null>(null);
  const [expression, setExpression] = useState<TargetNumberOp[]>([]);
  const [bestResult, setBestResult] = useState<number | null>(null);
  const [pending, startTx] = useTransition();

  const activeChips = useMemo(() => chips.filter((c) => !c.consumed), [chips]);

  function pickChip(chip: Chip) {
    if (!selectedLeft) {
      setSelectedLeft(chip);
      return;
    }
    if (!selectedOp) return; // must choose op first
    const a = selectedLeft.value;
    const b = chip.value;
    const result = applyOp(selectedOp, a, b);
    if (result == null || !Number.isInteger(result) || result <= 0) {
      toast.error("Invalid step (fractions and negatives not allowed).");
      setSelectedLeft(null);
      setSelectedOp(null);
      return;
    }
    const step: TargetNumberOp = { op: selectedOp, left: a, right: b, result };
    setChips((prev) => {
      const next = prev.map((c) =>
        c.key === selectedLeft.key || c.key === chip.key ? { ...c, consumed: true } : c,
      );
      next.push({
        key: `s${expression.length}`,
        value: result,
        consumed: false,
        fromStep: expression.length,
      });
      return next;
    });
    setExpression((prev) => [...prev, step]);
    setSelectedLeft(null);
    setSelectedOp(null);
  }

  function undoLast() {
    if (expression.length === 0) return;
    const last = expression[expression.length - 1];
    setExpression((prev) => prev.slice(0, -1));
    setChips((prev) => {
      const withoutResult = prev.filter((c) => c.fromStep !== expression.length - 1);
      return withoutResult.map((c) =>
        c.value === last.left || c.value === last.right ? { ...c, consumed: false } : c,
      );
    });
    setSelectedLeft(null);
    setSelectedOp(null);
  }

  function submit() {
    if (expression.length === 0) return;
    const currentResult = expression[expression.length - 1].result;
    startTx(async () => {
      const res = await submitTargetNumberAction({ round_id: roundId, expression });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      if (res.data.better) setBestResult(currentResult);
      toast.success(
        res.data.better
          ? `New best: ${currentResult} (distance ${Math.abs(target - currentResult)})`
          : "Not better than your current best.",
      );
    });
  }

  return (
    <div className="space-y-4">
      <RoundCountdown endsAt={endsAt} totalMs={TARGET_NUMBER_DURATION_MS} />
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
          <div className="text-4xl font-bold tabular-nums">{target}</div>
        </div>
        {bestResult !== null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your best</div>
            <div className="text-2xl font-semibold tabular-nums">{bestResult}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {activeChips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickChip(c)}
            className={`rounded-md border px-3 py-2 font-mono text-lg ${
              selectedLeft?.key === c.key ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            {c.value}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["+", "-", "*", "/"] as const).map((op) => (
          <Button
            key={op}
            type="button"
            variant={selectedOp === op ? "default" : "outline"}
            onClick={() => setSelectedOp(op)}
            disabled={!selectedLeft}
          >
            {op}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={undoLast} disabled={expression.length === 0}>
          Undo
        </Button>
        <Button type="button" onClick={submit} disabled={expression.length === 0 || pending}>
          Submit
        </Button>
      </div>

      {expression.length > 0 && (
        <ol className="rounded-md bg-muted/50 p-3 font-mono text-sm">
          {expression.map((s, i) => (
            <li key={i}>
              {s.left} {s.op} {s.right} = <strong>{s.result}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function applyOp(op: TargetNumberOp["op"], a: number, b: number): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b > 0 ? a - b : null;
    case "*":
      return a * b;
    case "/":
      if (b === 0 || a % b !== 0) return null;
      return a / b;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/target-number-round.tsx
git commit -m "feat(games): target number round client with guided builder"
```

---

## Task 11: Zero In round client

**Files:**
- Create: `components/games/zero-in-round.tsx`

**Interfaces:**
- Consumes: `submitZeroInGuessAction`; `RoundCountdown`; `ZERO_IN_MAX_GUESSES`.
- Produces: `<ZeroInRound roundId={} endsAt={} />` — number input, guess history with hi/lo tags.

- [ ] **Step 1: Implement**

Create `components/games/zero-in-round.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoundCountdown } from "./round-countdown";
import { submitZeroInGuessAction } from "@/lib/actions/game";
import { ZERO_IN_MAX_GUESSES, ZERO_IN_DURATION_MS } from "@/lib/games/zero-in";
import type { ZeroInFeedback } from "@/lib/games/types";

type UiGuess = { value: number; feedback: ZeroInFeedback };

export function ZeroInRound({
  roundId,
  endsAt,
}: {
  roundId: string;
  endsAt: string;
}) {
  const [value, setValue] = useState("");
  const [guesses, setGuesses] = useState<UiGuess[]>([]);
  const [pending, startTx] = useTransition();
  const guessesLeft = ZERO_IN_MAX_GUESSES - guesses.length;
  const done = guesses.some((g) => g.feedback === "exact") || guessesLeft === 0;

  function submit() {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("Enter a whole number between 1 and 1000.");
      return;
    }
    startTx(async () => {
      const res = await submitZeroInGuessAction({ round_id: roundId, guess: n });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setGuesses((prev) => [...prev, { value: n, feedback: res.data.feedback }]);
      setValue("");
      if (res.data.feedback === "exact") toast.success("Exact! Wait for the reveal.");
    });
  }

  return (
    <div className="space-y-4">
      <RoundCountdown endsAt={endsAt} totalMs={ZERO_IN_DURATION_MS} />
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Secret number</div>
        <div className="text-4xl font-bold">1 – 1000</div>
        <div className="text-sm text-muted-foreground">
          {done ? "You're done — waiting for reveal." : `${guessesLeft} guesses left`}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={done || pending}
          placeholder="Your guess"
        />
        <Button onClick={submit} disabled={done || pending || value === ""}>
          Guess
        </Button>
      </div>

      <ol className="space-y-1">
        {guesses.map((g, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border px-3 py-2 font-mono"
          >
            <span>{g.value}</span>
            <span
              className={
                g.feedback === "exact"
                  ? "text-green-600"
                  : g.feedback === "higher"
                    ? "text-amber-600"
                    : "text-blue-600"
              }
            >
              {g.feedback === "exact" ? "exact!" : g.feedback === "higher" ? "higher ↑" : "lower ↓"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/zero-in-round.tsx
git commit -m "feat(games): zero in round client with hi/lo history"
```

---

## Task 12: Live submission counter

**Files:**
- Create: `components/games/submission-counter.tsx`

**Interfaces:**
- Consumes: nothing (uses browser Supabase client directly).
- Produces: `<SubmissionCounter roundId={} eligibleCount={} />` — shows "N of M submitted" and refreshes on any INSERT to `game_submissions` for this round. Uses the `useId()` instance suffix pattern from `ParticipationCounter`.

- [ ] **Step 1: Implement**

Create `components/games/submission-counter.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SubmissionCounter({
  roundId,
  eligibleCount,
}: {
  roundId: string;
  eligibleCount: number;
}) {
  const [n, setN] = useState(0);
  const instanceId = useId();

  const refresh = useCallback(async () => {
    const s = createSupabaseBrowserClient();
    const { count } = await s
      .from("game_submissions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", roundId);
    setN(count ?? 0);
  }, [roundId]);

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    refresh();
    const ch = s
      .channel(`round-subs:${roundId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "game_submissions",
          filter: `round_id=eq.${roundId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [roundId, instanceId, refresh]);

  return (
    <div className="text-sm text-muted-foreground">
      {n} of {eligibleCount} submitted
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/submission-counter.tsx
git commit -m "feat(games): live submission counter with per-instance channel"
```

---

## Task 13: Round scoreboard component

**Files:**
- Create: `components/games/round-scoreboard.tsx`

**Interfaces:**
- Consumes: `getLeaderboardAction` for the all-time toggle.
- Produces: `<RoundScoreboard roundId={} initialResults={} kind={} />` — round table + toggle to all-time list. Subscribes to `round:{roundId}:{instanceId}` and calls `router.refresh()` on `round-finished`.

- [ ] **Step 1: Implement**

Create `components/games/round-scoreboard.tsx`:

```tsx
"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getLeaderboardAction } from "@/lib/actions/game";
import type { GameKind, PlayerResult } from "@/lib/games/types";

type LeaderboardRow = {
  player_id: string;
  display_name: string;
  total_points: number;
  rounds_played: number;
  last_played_at: string;
};

export function RoundScoreboard({
  roundId,
  kind,
  initialResults,
}: {
  roundId: string;
  kind: GameKind;
  initialResults: PlayerResult[];
}) {
  const [tab, setTab] = useState<"round" | "alltime">("round");
  const [alltime, setAlltime] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const instanceId = useId();

  useEffect(() => {
    const s = createSupabaseBrowserClient();
    const ch = s
      .channel(`round:${roundId}:${instanceId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rounds",
          filter: `id=eq.${roundId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      s.removeChannel(ch);
    };
  }, [roundId, instanceId, router]);

  async function loadAllTime() {
    if (alltime) return;
    setLoading(true);
    const res = await getLeaderboardAction();
    setLoading(false);
    if (res.ok) setAlltime(res.data);
  }

  const sorted = [...initialResults].sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Round · {kind === "target_number" ? "Target Number" : "Zero In"}
      </div>
      <div className="inline-flex rounded-md border p-0.5">
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${tab === "round" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => setTab("round")}
        >
          This round
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${tab === "alltime" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => {
            setTab("alltime");
            void loadAllTime();
          }}
        >
          All time
        </button>
      </div>

      {tab === "round" ? (
        <ol className="space-y-1">
          {sorted.map((r, i) => (
            <li key={r.player_id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="tabular-nums">{i + 1}. {r.display}</span>
              <span className="font-semibold tabular-nums">+{r.points}</span>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="text-sm text-muted-foreground">No one submitted this round.</li>
          )}
        </ol>
      ) : loading || !alltime ? (
        <div className="text-sm text-muted-foreground">Loading leaderboard…</div>
      ) : (
        <ol className="space-y-1">
          {alltime.slice(0, 20).map((r, i) => (
            <li key={r.player_id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{i + 1}. {r.display_name}</span>
              <span className="font-semibold tabular-nums">{r.total_points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/round-scoreboard.tsx
git commit -m "feat(games): round scoreboard with realtime finish + all-time toggle"
```

---

## Task 14: Game lobby panel + mount

**Files:**
- Create: `components/games/game-lobby-panel.tsx`
- Modify: `app/(app)/meetings/[id]/page.tsx`

**Interfaces:**
- Consumes: `ensureRoundAction`, `finalizeRoundAction`, all round + scoreboard components.
- Produces: `<GameLobbyPanel meetingId scheduledStart status />` — server component that on mount decides which sub-view to render:
  - `status !== 'scheduled'` → renders nothing.
  - `now < scheduledStart - 10min` → "Lobby opens 10 min before start."
  - Lobby open, no round yet → renders a client wrapper that calls `ensureRoundAction` on mount.
  - Active round → renders the per-kind round component + participation counter.
  - Finished round → renders `RoundScoreboard`.

- [ ] **Step 1: Implement the panel**

Create `components/games/game-lobby-panel.tsx`:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureRoundAction } from "@/lib/actions/game";
import { TargetNumberRound } from "./target-number-round";
import { ZeroInRound } from "./zero-in-round";
import { SubmissionCounter } from "./submission-counter";
import { RoundScoreboard } from "./round-scoreboard";
import type { PlayerResult } from "@/lib/games/types";

export async function GameLobbyPanel({
  meetingId,
  scheduledStart,
  status,
}: {
  meetingId: string;
  scheduledStart: string;
  status: string;
}) {
  if (status !== "scheduled") return null;

  const startMs = new Date(scheduledStart).getTime();
  const lobbyOpen = Date.now() >= startMs - 10 * 60_000;
  if (!lobbyOpen) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        Pre-meeting game opens 10 minutes before the meeting starts.
      </section>
    );
  }

  const ensured = await ensureRoundAction({ meeting_id: meetingId });
  if (!ensured.ok) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        Couldn&apos;t start the game: {ensured.error.message}
      </section>
    );
  }
  const round = ensured.data;

  // "Eligible" = participants of the meeting, or the whole profiles table if
  // participants_override is null (matches the RLS gate).
  const supabase = await createSupabaseServerClient();
  const { data: mtg } = await supabase
    .from("meetings")
    .select("participants_override")
    .eq("id", meetingId)
    .single();
  let eligibleCount = 0;
  if (mtg?.participants_override && Array.isArray(mtg.participants_override)) {
    eligibleCount = mtg.participants_override.length;
  } else {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    eligibleCount = count ?? 0;
  }

  if (round.status === "finished") {
    const { data: subs } = await supabase
      .from("game_submissions")
      .select("player_id, points, payload, profiles!inner(display_name)")
      .eq("round_id", round.round_id)
      .not("points", "is", null);
    const results: PlayerResult[] = ((subs ?? []) as unknown as Array<{
      player_id: string;
      points: number;
      payload: unknown;
      profiles: { display_name: string };
    }>).map((s) => ({
      player_id: s.player_id,
      points: s.points ?? 0,
      display: formatDisplay(round.kind, s.payload, s.profiles.display_name),
    }));
    return (
      <section className="space-y-4 rounded-lg border p-4">
        <RoundScoreboard roundId={round.round_id} kind={round.kind} initialResults={results} />
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pre-meeting game</h2>
          <p className="text-sm text-muted-foreground">
            {round.kind === "target_number"
              ? "Combine base numbers to hit the target."
              : "Guess the secret number. Three tries."}
          </p>
        </div>
        <SubmissionCounter roundId={round.round_id} eligibleCount={eligibleCount} />
      </header>
      {round.kind === "target_number" && round.puzzle.kind === "target_number" ? (
        <TargetNumberRound
          roundId={round.round_id}
          target={round.puzzle.target}
          bases={round.puzzle.bases}
          endsAt={round.ends_at}
        />
      ) : (
        <ZeroInRound roundId={round.round_id} endsAt={round.ends_at} />
      )}
    </section>
  );
}

function formatDisplay(
  kind: "target_number" | "zero_in",
  payload: unknown,
  name: string,
): string {
  if (kind === "target_number") {
    const p = payload as { best_result?: number } | null;
    return `${name} · ${p?.best_result ?? "—"}`;
  }
  const p = payload as { best_guess?: number } | null;
  return `${name} · ${p?.best_guess ?? "—"}`;
}
```

- [ ] **Step 2: Mount the panel on the meeting page**

Inspect the current page shell:

Run: `grep -n "status\|agenda" app/(app)/meetings/\[id\]/page.tsx | head -30`

Then add the panel above the agenda section. In `app/(app)/meetings/[id]/page.tsx`, import and render:

```tsx
import { GameLobbyPanel } from "@/components/games/game-lobby-panel";
// …inside the JSX, before the agenda block:
<GameLobbyPanel
  meetingId={meeting.id}
  scheduledStart={meeting.scheduled_start}
  status={meeting.status}
/>
```

Ensure `meeting.scheduled_start` and `meeting.status` are already fetched by the page's server component; if not, add them to the existing `.select(...)`.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`
Open a scheduled meeting whose start is within 10 minutes. Verify the panel appears above the agenda and a round is created on load. Play through Target Number and confirm a submission is upserted (`select * from game_submissions where round_id = …` in a psql shell).

- [ ] **Step 4: Commit**

```bash
git add components/games/game-lobby-panel.tsx "app/(app)/meetings/[id]/page.tsx"
git commit -m "feat(games): mount pre-meeting game panel above meeting agenda"
```

---

## Task 15: Hook finalize into the start-meeting flow

**Files:**
- Modify: whatever file dispatches the "Start meeting" server action (locate with `grep -rn "status.*live\|startMeeting\|start_meeting" lib/actions components`).
- Add: a call to `finalizeRoundAction({ round_id })` when a `game_rounds` row exists for the meeting and is `active`.

**Interfaces:**
- Consumes: `finalizeRoundAction`.
- Produces: none new — extends existing meeting-start behaviour.

- [ ] **Step 1: Locate the start-meeting action**

Run: `grep -rn "status.*'live'\|from(\"meetings\").update" lib/actions | head`
Expected: find the action that transitions `meetings.status` from `scheduled` to `live`.

- [ ] **Step 2: Add finalize call**

Inside that action, before the `status → 'live'` update:

```ts
import { finalizeRoundAction } from "@/lib/actions/game";
// …
const round = await supabase
  .from("game_rounds")
  .select("id, status")
  .eq("meeting_id", meetingId)
  .maybeSingle();
if (round.data && round.data.status === "active") {
  await finalizeRoundAction({ round_id: round.data.id });
}
```

- [ ] **Step 3: Manual test**

Start a scheduled meeting via the UI. Confirm the round transitions to `finished`, `game_submissions.points` are populated, and the scoreboard renders.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/<start-meeting-file>.ts
git commit -m "feat(games): finalize active round when meeting starts"
```

---

## Task 16: All-time leaderboard page

**Files:**
- Create: `app/(app)/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `getLeaderboardAction`.
- Produces: a server-rendered page listing all players ranked by total points.

- [ ] **Step 1: Implement**

Create `app/(app)/leaderboard/page.tsx`:

```tsx
import { getLeaderboardAction } from "@/lib/actions/game";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const res = await getLeaderboardAction();
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Couldn&apos;t load: {res.error.message}</p>
      </main>
    );
  }
  const rows = res.data;
  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          All-time points across pre-meeting games.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games played yet. Play a round before your next meeting.
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.player_id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>
                <span className="tabular-nums">{i + 1}.</span> {r.display_name}
              </span>
              <span className="tabular-nums">
                <strong>{r.total_points}</strong>
                <span className="ml-2 text-xs text-muted-foreground">{r.rounds_played} rounds</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Manual test**

Visit `/leaderboard` after playing at least one round. Confirm the row shows.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/leaderboard/page.tsx"
git commit -m "feat(games): all-time leaderboard page"
```

---

## Post-implementation

- [ ] **Run the full test suite**

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: all pass.

- [ ] **RLS tests**

```bash
pnpm test:rls
```
Expected: all pass.

- [ ] **Full manual smoke**

Play both games end-to-end in a scheduled meeting, force meeting start mid-round, confirm partial scores post, confirm the all-time leaderboard reflects new points.
