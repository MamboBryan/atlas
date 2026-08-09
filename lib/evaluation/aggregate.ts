export type RatingRow = {
  candidateId: string;
  questionId: string;
  score: number;
};
export type PersonalScore = {
  candidateId: string;
  value: number | null;
  ratedCount: number;
};

export type RaterRatingRow = RatingRow & { raterId: string };
export type EvaluatorScore = {
  raterId: string;
  value: number;
  ratedCount: number;
};

// value = sum of scores (aggregateQuestions=false) or mean (true), 2dp.
function collapse(scores: number[], aggregateQuestions: boolean): number {
  const total = scores.reduce((a, b) => a + b, 0);
  const raw = aggregateQuestions ? total / scores.length : total;
  return Math.round(raw * 100) / 100;
}

export function computePersonalScores(
  rows: RatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
  aggregateQuestions: boolean,
): PersonalScore[] {
  const activeQ = new Set(activeQuestionIds);
  const activeC = new Set(activeCandidateIds);
  const byCandidate = new Map<string, number[]>();
  for (const c of activeCandidateIds) byCandidate.set(c, []);
  for (const r of rows) {
    if (!activeC.has(r.candidateId) || !activeQ.has(r.questionId)) continue;
    byCandidate.get(r.candidateId)!.push(r.score);
  }
  const out: PersonalScore[] = activeCandidateIds.map((candidateId) => {
    const scores = byCandidate.get(candidateId)!;
    const value = scores.length ? collapse(scores, aggregateQuestions) : null;
    return { candidateId, value, ratedCount: scores.length };
  });
  out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return out;
}

/**
 * Per-candidate breakdown of each evaluator's own value across the active
 * (non-hidden) questions they scored. Owner/admin-only, closed-evaluation view —
 * this deliberately de-anonymizes the aggregate, so no small-panel suppression
 * is applied here (that gate lives at the query/RPC layer). Value is a sum
 * (aggregateQuestions=false) or a 2dp mean (true). Partial raters are included
 * (diagnostic view); the RPC overall separately counts only completed raters.
 * Evaluators are sorted highest-first per candidate; candidates with no ratings
 * map to an empty array.
 */
export function computeEvaluatorBreakdown(
  rows: RaterRatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
  aggregateQuestions: boolean,
): Map<string, EvaluatorScore[]> {
  const activeQ = new Set(activeQuestionIds);
  const activeC = new Set(activeCandidateIds);
  // candidateId|raterId -> scores
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (!activeC.has(r.candidateId) || !activeQ.has(r.questionId)) continue;
    const key = `${r.candidateId}|${r.raterId}`;
    let scores = groups.get(key);
    if (!scores) groups.set(key, (scores = []));
    scores.push(r.score);
  }
  const byCandidate = new Map<string, EvaluatorScore[]>();
  for (const c of activeCandidateIds) byCandidate.set(c, []);
  for (const [key, scores] of groups) {
    const [candidateId, raterId] = key.split("|");
    byCandidate
      .get(candidateId)!
      .push({
        raterId,
        value: collapse(scores, aggregateQuestions),
        ratedCount: scores.length,
      });
  }
  for (const list of byCandidate.values()) {
    list.sort((a, b) => b.value - a.value);
  }
  return byCandidate;
}
