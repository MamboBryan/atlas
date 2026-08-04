import { notFound } from "next/navigation";
import { getEvaluationForViewer } from "@/lib/evaluation/queries";
import { RatingPanel } from "@/app/(app)/hiring/[id]/_ui/rating-panel";
import { ResultsView } from "@/app/(app)/hiring/[id]/_ui/results-view";
import { StatusBadge } from "@/app/(app)/hiring/_ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function EvaluationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEvaluationForViewer(id);
  if (!data) notFound();
  const { ev, isAdmin, isPanelist, candidates, questions, answers, personal, results } = data;

  // Admin management moved to the right rail (@right/hiring/[id]). When an admin
  // has nothing to rate/review in the main column, point them there.
  const adminManageOnly =
    isAdmin && (ev.status === "draft" || (ev.status === "open" && !isPanelist));

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold text-ink">{ev.name}</h1>
        <StatusBadge status={ev.status} />
      </header>

      {ev.status === "closed" && results != null && <ResultsView results={results as any} />}

      {ev.status === "open" && isPanelist && (
        <RatingPanel evaluationId={ev.id} candidates={candidates} questions={questions}
          answers={answers} myScores={personal} />
      )}

      {ev.status === "open" && !isPanelist && !isAdmin && (
        <EmptyState
          headline="Not on the panel"
          body="You’re not on this evaluation’s panel."
        />
      )}
      {ev.status === "draft" && !isAdmin && (
        <EmptyState
          headline="Not open yet"
          body="This evaluation isn’t open yet."
        />
      )}
      {adminManageOnly && (
        <EmptyState
          headline="Manage from the side panel"
          body="Use the controls on the right to connect a sheet, set the evaluator panel, and open or close this evaluation."
        />
      )}
    </div>
  );
}
