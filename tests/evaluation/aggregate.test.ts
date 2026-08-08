import { expect, test } from "vitest";
import {
  computeEvaluatorBreakdown,
  computePersonalScores,
} from "@/lib/evaluation/aggregate";

test("ON (average): mean over rated active questions, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 4 },
    { candidateId: "c1", questionId: "q2", score: 2 }, // c1 mean = 3
    { candidateId: "c2", questionId: "q1", score: 5 }, // c2 mean = 5
  ];
  const out = computePersonalScores(rows, ["c1", "c2", "c3"], ["q1", "q2"], true);
  expect(out).toEqual([
    { candidateId: "c2", value: 5, ratedCount: 1 },
    { candidateId: "c1", value: 3, ratedCount: 2 },
    { candidateId: "c3", value: null, ratedCount: 0 },
  ]);
});

test("OFF (sum): total over rated active questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", score: 5 },
    { candidateId: "c1", questionId: "q2", score: 5 },
    { candidateId: "c1", questionId: "q3", score: 5 },
    { candidateId: "c1", questionId: "q4", score: 5 },
    { candidateId: "c1", questionId: "q5", score: 5 }, // sum = 25
  ];
  const out = computePersonalScores(
    rows,
    ["c1"],
    ["q1", "q2", "q3", "q4", "q5"],
    false,
  );
  expect(out).toEqual([{ candidateId: "c1", value: 25, ratedCount: 5 }]);
});

test("ignores ratings for inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qDead", score: 1 },
    { candidateId: "cDead", questionId: "q1", score: 1 },
  ];
  const out = computePersonalScores(rows, ["c1"], ["q1"], false);
  expect(out).toEqual([{ candidateId: "c1", value: null, ratedCount: 0 }]);
});

test("breakdown ON (average): per-rater mean per candidate, sorted desc", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", raterId: "r1", score: 5 },
    { candidateId: "c1", questionId: "q2", raterId: "r1", score: 4 }, // r1 -> 4.5
    { candidateId: "c1", questionId: "q1", raterId: "r2", score: 3 }, // r2 -> 3
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1", "c2"], ["q1", "q2"], true);
  expect(out.get("c1")).toEqual([
    { raterId: "r1", value: 4.5, ratedCount: 2 },
    { raterId: "r2", value: 3, ratedCount: 1 },
  ]);
  expect(out.get("c2")).toEqual([]);
});

test("breakdown OFF (sum): per-rater total, includes partial raters", () => {
  const rows = [
    { candidateId: "c1", questionId: "q1", raterId: "r1", score: 5 },
    { candidateId: "c1", questionId: "q2", raterId: "r1", score: 5 }, // r1 sum = 10
    { candidateId: "c1", questionId: "q1", raterId: "r2", score: 4 }, // r2 partial sum = 4
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1"], ["q1", "q2"], false);
  expect(out.get("c1")).toEqual([
    { raterId: "r1", value: 10, ratedCount: 2 },
    { raterId: "r2", value: 4, ratedCount: 1 },
  ]);
});

test("breakdown ignores inactive candidates/questions", () => {
  const rows = [
    { candidateId: "c1", questionId: "qHidden", raterId: "r1", score: 1 },
    { candidateId: "cDead", questionId: "q1", raterId: "r1", score: 1 },
  ];
  const out = computeEvaluatorBreakdown(rows, ["c1"], ["q1"], false);
  expect(out.get("c1")).toEqual([]);
});
