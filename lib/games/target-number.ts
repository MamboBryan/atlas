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

function applyOp(
  op: TargetNumberOp["op"],
  a: number,
  b: number,
): number | null {
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
    if (!consume(step.right))
      return { ok: false, reason: "right not available" };
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
  const bonusFraction = Math.max(0, 1 - elapsed / TARGET_NUMBER_DURATION_MS);
  const bonus = Math.round(15 * bonusFraction);
  return base + bonus;
}
