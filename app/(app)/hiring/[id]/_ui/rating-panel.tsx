"use client";
import { useState, useTransition } from "react";
import { rateAnswerAction } from "@/lib/actions/evaluation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Q = { id: string; prompt: string };
type C = { id: string; display_name: string };
type A = { candidate_id: string; question_id: string; answer_text: string | null };
type R = { candidateId: string; questionId: string; score: number };

const cellKey = (cid: string, qid: string) => `${cid}:${qid}`;

export function RatingPanel({
  evaluationId, candidates, questions, answers, myRatings,
}: {
  evaluationId: string; candidates: C[]; questions: Q[]; answers: A[]; myRatings: R[];
}) {
  const [isPending, start] = useTransition();

  // Seed from ratings already saved by this panelist so returning to a
  // partly-rated evaluation restores every selection.
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const r of myRatings) seed[cellKey(r.candidateId, r.questionId)] = r.score;
    return seed;
  });

  const candidateDone = (cid: string) =>
    questions.length > 0 && questions.every((q) => scores[cellKey(cid, q.id)] !== undefined);

  // Open on the first candidate that still needs work.
  const [idx, setIdx] = useState(() => {
    const first = candidates.findIndex((c) => !candidateDone(c.id));
    return first === -1 ? 0 : first;
  });

  const answerFor = (cid: string, qid: string) =>
    answers.find((a) => a.candidate_id === cid && a.question_id === qid)?.answer_text ?? "—";

  if (candidates.length === 0 || questions.length === 0) {
    return (
      <EmptyState
        headline="Nothing to rate yet"
        body="This evaluation has no candidates or questions to rate."
      />
    );
  }

  const current = candidates[Math.min(idx, candidates.length - 1)];
  const candidatesRated = candidates.filter((c) => candidateDone(c.id)).length;
  const currentAnswered = questions.filter(
    (q) => scores[cellKey(current.id, q.id)] !== undefined,
  ).length;

  const rate = (cid: string, qid: string, score: number) => {
    setScores((prev) => ({ ...prev, [cellKey(cid, qid)]: score }));
    start(() =>
      rateAnswerAction({ evaluationId, candidateId: cid, questionId: qid, score }).then(() => {}),
    );
  };

  return (
    <div className="space-y-4">
      {/* Overall progress across all candidates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">
            {candidatesRated} of {candidates.length} candidates rated
          </span>
          <span className="text-ink-soft">
            {isPending ? "Saving…" : "All changes saved"}
          </span>
        </div>
        <ProgressBar value={candidatesRated} max={candidates.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{current.display_name}</CardTitle>
          {/* Per-candidate question progress */}
          <div className="mt-2 flex items-center gap-3 text-sm text-ink-soft">
            <span className="shrink-0">
              Candidate {idx + 1} of {candidates.length}
            </span>
            <span aria-hidden className="text-ink-soft/50">•</span>
            <span className="shrink-0">
              {currentAnswered} of {questions.length} answered
            </span>
            <ProgressBar
              value={currentAnswered}
              max={questions.length}
              className="ml-1 h-1.5 flex-1"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {questions.map((q) => {
            const key = cellKey(current.id, q.id);
            const selected = scores[key];
            return (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-semibold text-ink">{q.prompt}</p>
                <p className="whitespace-pre-wrap text-sm text-ink-soft">
                  {answerFor(current.id, q.id)}
                </p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="icon-sm"
                      variant={selected === s ? "default" : "outline"}
                      aria-pressed={selected === s}
                      onClick={() => rate(current.id, q.id, s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>

        <CardFooter className="justify-between">
          <Button
            variant="ghost"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            Previous
          </Button>
          <Button
            variant="default"
            disabled={idx >= candidates.length - 1}
            onClick={() => setIdx((i) => Math.min(candidates.length - 1, i + 1))}
          >
            Next
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function ProgressBar({
  value, max, className,
}: {
  value: number; max: number; className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-2 w-full overflow-hidden rounded-pill bg-ink/10", className)}
    >
      <div
        className="h-full rounded-pill bg-primary transition-[width] duration-med ease-soft"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
