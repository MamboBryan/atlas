"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { rateAnswerAction } from "@/lib/actions/evaluation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/app/(app)/hiring/[id]/_ui/progress-bar";
import { cn } from "@/lib/utils";

type Q = { id: string; prompt: string };
type C = { id: string; display_name: string };
type A = { candidate_id: string; question_id: string; answer_text: string | null };
type R = { candidateId: string; questionId: string; score: number };

const cellKey = (cid: string, qid: string) => `${cid}:${qid}`;

export function EvaluateShell({
  evaluationId, evaluationName, candidates, questions, answers, myRatings, single,
}: {
  evaluationId: string;
  evaluationName: string;
  candidates: C[];
  questions: Q[];
  answers: A[];
  myRatings: R[];
  single: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const [scores, setScores] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const r of myRatings) seed[cellKey(r.candidateId, r.questionId)] = r.score;
    return seed;
  });

  const candidateDone = useCallback(
    (cid: string) =>
      questions.length > 0 && questions.every((q) => scores[cellKey(cid, q.id)] !== undefined),
    [questions, scores],
  );

  const [idx, setIdx] = useState(() => {
    const first = candidates.findIndex((c) => !candidateDone(c.id));
    return first === -1 ? 0 : first;
  });

  const close = useCallback(() => router.push(`/hiring/${evaluationId}`), [router, evaluationId]);

  // Esc dismisses the fullscreen flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (candidates.length === 0 || questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <EmptyState
          headline="Nothing to rate"
          body="This evaluation has no candidates or questions to rate."
        />
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={close}>Back to evaluation</Button>
        </div>
      </div>
    );
  }

  const current = candidates[Math.min(idx, candidates.length - 1)];
  const candidatesRated = candidates.filter((c) => candidateDone(c.id)).length;
  const currentAnswered = questions.filter(
    (q) => scores[cellKey(current.id, q.id)] !== undefined,
  ).length;
  const isLast = idx >= candidates.length - 1;

  const answerFor = (cid: string, qid: string) =>
    answers.find((a) => a.candidate_id === cid && a.question_id === qid)?.answer_text ?? "—";

  const rate = (qid: string, score: number) => {
    setScores((prev) => ({ ...prev, [cellKey(current.id, qid)]: score }));
    start(() =>
      rateAnswerAction({
        evaluationId, candidateId: current.id, questionId: qid, score,
      }).then(() => {}),
    );
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* Header — a <div>, not <header>, so the app layout's global
          [&_header] rules don't hijack the fullscreen chrome. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-divider bg-surface px-8 py-5">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold text-ink">{evaluationName}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{isPending ? "Saving…" : "All changes saved"}</p>
        </div>
        <Button variant="outline" size="icon" onClick={close} aria-label="Close evaluation">
          <XIcon className="size-5" />
        </Button>
      </div>

      {/* Progress */}
      <div className="mx-auto w-full max-w-2xl space-y-2 px-6 pt-6">
        {!single && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink">
                {candidatesRated} of {candidates.length} candidates rated
              </span>
              <span className="text-ink-soft">
                Candidate {idx + 1} of {candidates.length}
              </span>
            </div>
            <ProgressBar value={candidatesRated} max={candidates.length} />
          </>
        )}
      </div>

      {/* Candidate */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-ink">{current.display_name}</h1>
          <span className="shrink-0 text-sm text-ink-soft">
            {currentAnswered} of {questions.length} answered
          </span>
        </div>
        <ProgressBar value={currentAnswered} max={questions.length} className="mb-8 h-1.5" />

        <div className="space-y-8">
          {questions.map((q) => {
            const selected = scores[cellKey(current.id, q.id)];
            return (
              <div key={q.id} className="space-y-2">
                <p className="text-base font-semibold text-ink">{q.prompt}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {answerFor(current.id, q.id)}
                </p>
                <div className="flex gap-2 pt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="icon"
                      variant={selected === s ? "default" : "outline"}
                      aria-pressed={selected === s}
                      onClick={() => rate(q.id, s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 z-10 border-t border-divider bg-surface px-6 py-4">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          {single ? (
            <span className="text-sm text-ink-soft">Re-evaluating one candidate</span>
          ) : (
            <Button
              variant="ghost"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
          )}
          {single || isLast ? (
            <Button variant="default" onClick={close}>Finish</Button>
          ) : (
            <Button
              variant="default"
              onClick={() => setIdx((i) => Math.min(candidates.length - 1, i + 1))}
            >
              Next
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
