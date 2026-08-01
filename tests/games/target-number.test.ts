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
