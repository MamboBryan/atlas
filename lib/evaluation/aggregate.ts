export type RatingRow = { candidateId: string; questionId: string; score: number };
export type PersonalScore = { candidateId: string; average: number | null; ratedCount: number };

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
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;
    return { candidateId, average, ratedCount: scores.length };
  });
  out.sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity));
  return out;
}
