export type RatingRow = {
  candidateId: string;
  questionId: string;
  score: number;
};
export type PersonalScore = {
  candidateId: string;
  average: number | null;
  ratedCount: number;
};

export type RaterRatingRow = RatingRow & { raterId: string };
export type EvaluatorScore = {
  raterId: string;
  average: number;
  ratedCount: number;
};

export function computePersonalScores(
  rows: RatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
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
    const average = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100
      : null;
    return { candidateId, average, ratedCount: scores.length };
  });
  out.sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity));
  return out;
}

/**
 * Per-candidate breakdown of each evaluator's own average across the active
 * (non-hidden) questions they scored. Owner/admin-only, closed-evaluation view —
 * this deliberately de-anonymizes the aggregate, so no small-panel suppression
 * is applied here (that gate lives at the query layer). Rounding matches the
 * closed candidate overall (2dp). Evaluators are sorted highest-first per
 * candidate; candidates with no ratings map to an empty array.
 */
export function computeEvaluatorBreakdown(
  rows: RaterRatingRow[],
  activeCandidateIds: string[],
  activeQuestionIds: string[],
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
    const average =
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
      100;
    byCandidate
      .get(candidateId)!
      .push({ raterId, average, ratedCount: scores.length });
  }
  for (const list of byCandidate.values()) {
    list.sort((a, b) => b.average - a.average);
  }
  return byCandidate;
}
