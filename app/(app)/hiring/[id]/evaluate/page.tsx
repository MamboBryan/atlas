import { notFound, redirect } from "next/navigation";
import { getEvaluationForViewer } from "@/lib/evaluation/queries";
import { EvaluateShell } from "@/app/(app)/hiring/[id]/_ui/evaluate-shell";

export default async function EvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ candidate?: string }>;
}) {
  const { id } = await params;
  const { candidate } = await searchParams;
  const data = await getEvaluationForViewer(id);
  if (!data) notFound();

  const { ev, isPanelist, candidates, questions, answers, myRatings } = data;

  // Rating is only possible for panelists on an open evaluation (RLS agrees).
  if (ev.status !== "open" || !isPanelist) redirect(`/hiring/${id}`);

  // `?candidate=` narrows to a single-candidate re-evaluation.
  const scoped =
    candidate && candidates.some((c) => c.id === candidate)
      ? candidates.filter((c) => c.id === candidate)
      : candidates;

  return (
    <EvaluateShell
      evaluationId={ev.id}
      evaluationName={ev.name}
      candidates={scoped}
      questions={questions}
      answers={answers}
      myRatings={myRatings}
      single={scoped.length === 1 && !!candidate}
    />
  );
}
