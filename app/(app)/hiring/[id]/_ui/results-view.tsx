type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = { candidate_id: string; display_name: string; overall: number | null; rank: number; cells: Cell[] };
type Results = { suppressed: boolean; rater_bucket: string; rater_count: number | null; candidates: Cand[] };

export function ResultsView({ results }: { results: Results }) {
  if (results.suppressed) {
    return <p className="text-ink/60">Not enough evaluators to show results yet ({results.rater_bucket} raters).</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{results.rater_count} evaluators</p>
      <ol className="space-y-2">
        {results.candidates.map((c) => (
          <li key={c.candidate_id} className="rounded-lg border border-ink/10 p-4">
            <div className="flex justify-between">
              <span className="font-medium">#{c.rank} {c.display_name}</span>
              <span className="font-semibold">{c.overall ?? "—"}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-ink/70">
              {c.cells.map((cell) => (
                <li key={cell.question_id} className="flex justify-between">
                  <span className="truncate">{cell.prompt}</span>
                  <span>{cell.avg ?? "—"}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
