import { expect, test } from "vitest";
import {
  computeEvaluatorBreakdown,
  computePersonalScores,
} from "@/lib/evaluation/aggregate";

test("mean-of-means over rated active questions, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 4 },
    { candidateId: "c1", questionId: "q2", score: 2 }, // c1 avg = 3
    { candidateId: "c2", questionId: "q1", score: 5 }, // c2 avg = 5
  ];
  const out = computePersonalScores(rows, ["c1", "c2", "c3"], ["q1", "q2"]);
  expect(out).toEqual([
    { candidateId: "c2", average: 5, ratedCount: 1 },
    { candidateId: "c1", average: 3, ratedCount: 2 },
    { candidateId: "c3", average: null, ratedCount: 0 },
  ]);
});

test("ignores ratings for inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qDead", score: 1 },
    { candidateId: "cDead", questionId: "q1", score: 1 },
  ];
  const out = computePersonalScores(rows, ["c1"], ["q1"]);
  expect(out).toEqual([{ candidateId: "c1", average: null, ratedCount: 0 }]);
});

test("evaluator breakdown: per-rater average per candidate, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", raterId: "r1", score: 5 },
    { candidateId: "c1", questionId: "q2", raterId: "r1", score: 4 }, // r1 -> 4.5
    { candidateId: "c1", questionId: "q1", raterId: "r2", score: 3 }, // r2 -> 3
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1", "c2"], ["q1", "q2"]);
  expect(out.get("c1")).toEqual([
    { raterId: "r1", average: 4.5, ratedCount: 2 },
    { raterId: "r2", average: 3, ratedCount: 1 },
  ]);
  expect(out.get("c2")).toEqual([]);
});

test("evaluator breakdown ignores inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qHidden", raterId: "r1", score: 1 },
    { candidateId: "cDead", questionId: "q1", raterId: "r1", score: 1 },
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1"], ["q1"]);
  expect(out.get("c1")).toEqual([]);
});
