import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = { candidate_id: string; display_name: string; overall: number | null; rank: number; cells: Cell[] };
type Results = { suppressed: boolean; rater_bucket: string; rater_count: number | null; candidates: Cand[] };

export function ResultsView({ results }: { results: Results }) {
  if (results.suppressed) {
    return (
      <EmptyState
        headline="Results are hidden"
        body={`Not enough evaluators to show results yet (${results.rater_bucket} raters).`}
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{results.rater_count} evaluators</p>
      <div className="space-y-2">
        {results.candidates.map((c) => (
          <Card key={c.candidate_id} size="sm">
            <CardHeader>
              <CardTitle>#{c.rank} {c.display_name}</CardTitle>
              <CardAction>
                <span className="font-display text-2xl font-extrabold text-ink">
                  {c.overall ?? "—"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-1">
              {c.cells.map((cell) => (
                <div key={cell.question_id} className="flex justify-between gap-4 text-sm text-ink-soft">
                  <span className="truncate">{cell.prompt}</span>
                  <span className="shrink-0 text-ink">{cell.avg ?? "—"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
