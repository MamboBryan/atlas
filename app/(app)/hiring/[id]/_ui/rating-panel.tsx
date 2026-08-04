"use client";
import { useTransition } from "react";
import { rateAnswerAction } from "@/lib/actions/evaluation";

type Q = { id: string; prompt: string };
type C = { id: string; display_name: string };
type A = { candidate_id: string; question_id: string; answer_text: string | null };

export function RatingPanel({
  evaluationId, candidates, questions, answers, myScores,
}: {
  evaluationId: string; candidates: C[]; questions: Q[]; answers: A[];
  myScores: { candidateId: string; average: number | null; ratedCount: number }[];
}) {
  const [, start] = useTransition();
  const answerFor = (cid: string, qid: string) =>
    answers.find((a) => a.candidate_id === cid && a.question_id === qid)?.answer_text ?? "—";

  return (
    <div className="space-y-8">
      {candidates.map((c) => (
        <section key={c.id} className="rounded-lg border border-ink/10 p-4">
          <h3 className="font-medium">{c.display_name}</h3>
          {questions.map((q) => (
            <div key={q.id} className="mt-3">
              <p className="text-sm font-medium text-ink/80">{q.prompt}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{answerFor(c.id, q.id)}</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s}
                    onClick={() => start(() => rateAnswerAction({
                      evaluationId, candidateId: c.id, questionId: q.id, score: s,
                    }).then(() => {}))}
                    className="h-8 w-8 rounded border border-ink/15 text-sm hover:bg-primary/10">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
