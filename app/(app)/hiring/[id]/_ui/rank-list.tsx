"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/app/(app)/hiring/[id]/_ui/progress-bar";
import { cn } from "@/lib/utils";

type Q = { id: string; prompt: string };
type C = { id: string; display_name: string };
type A = { candidate_id: string; question_id: string; answer_text: string | null };
type R = { candidateId: string; questionId: string; score: number };
type Ranked = { candidateId: string; average: number | null; ratedCount: number };

const cellKey = (cid: string, qid: string) => `${cid}:${qid}`;

export function RankList({
  evaluationId, candidates, questions, answers, myRatings, ranked,
}: {
  evaluationId: string;
  candidates: C[];
  questions: Q[];
  answers: A[];
  myRatings: R[];
  ranked: Ranked[];
}) {
  const [openCand, setOpenCand] = useState<Set<string>>(new Set());
  const [openQ, setOpenQ] = useState<Set<string>>(new Set());

  const nameById = new Map(candidates.map((c) => [c.id, c.display_name]));
  const scoreFor = new Map<string, number>();
  for (const r of myRatings) scoreFor.set(cellKey(r.candidateId, r.questionId), r.score);
  const answerFor = new Map<string, string>();
  for (const a of answers) {
    const t = a.answer_text?.trim();
    if (t) answerFor.set(cellKey(a.candidate_id, a.question_id), t);
  }

  const toggleCand = (id: string) =>
    setOpenCand((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleQ = (key: string) =>
    setOpenQ((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (candidates.length === 0 || questions.length === 0) {
    return (
      <EmptyState
        headline="Nothing to evaluate yet"
        body="This evaluation has no candidates or questions."
      />
    );
  }

  const total = questions.length;
  const candidatesRated = ranked.filter((r) => r.ratedCount >= total).length;
  const allDone = candidatesRated === candidates.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-ink">
            {candidatesRated} of {candidates.length} candidates rated
          </p>
          <ProgressBar
            value={candidatesRated}
            max={candidates.length}
            className="w-48 max-w-full"
          />
        </div>
        <Button
          variant="default"
          render={<Link href={`/hiring/${evaluationId}/evaluate`} />}
        >
          {candidatesRated === 0 ? "Evaluate" : allDone ? "Re-evaluate" : "Continue"}
        </Button>
      </div>

      <Card size="sm" className="gap-0 py-0">
        <div className="flex items-center justify-between border-b border-divider px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          <span>Candidate</span>
          <span>Your score</span>
        </div>

        {ranked.map((r, i) => {
          const name = nameById.get(r.candidateId) ?? "—";
          const isOpen = openCand.has(r.candidateId);
          return (
            <div key={r.candidateId} className="border-b border-divider last:border-b-0">
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => toggleCand(r.candidateId)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors duration-fast ease-soft hover:bg-ink/5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDownIcon
                      className={cn(
                        "size-4 shrink-0 text-ink-soft transition-transform duration-fast ease-soft",
                        isOpen && "rotate-180",
                      )}
                    />
                    <span className="truncate text-sm font-extrabold text-ink">
                      #{i + 1} {name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-display text-lg font-extrabold",
                      r.average == null ? "text-ink-soft" : "text-ink",
                    )}
                  >
                    {r.average ?? "—"}
                  </span>
                </button>
                <div className="flex items-center pr-3">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/hiring/${evaluationId}/evaluate?candidate=${r.candidateId}`} />
                    }
                  >
                    Evaluate
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-divider bg-surface">
                  {questions.map((q) => {
                    const key = cellKey(r.candidateId, q.id);
                    const myScore = scoreFor.get(key);
                    const answer = answerFor.get(key);
                    const qOpen = openQ.has(key);
                    return (
                      <div key={q.id} className="border-b border-divider last:border-b-0">
                        {answer ? (
                          <button
                            type="button"
                            onClick={() => toggleQ(key)}
                            aria-expanded={qOpen}
                            className="flex w-full items-center justify-between gap-4 py-2 pl-10 pr-4 text-left text-sm transition-colors duration-fast ease-soft hover:bg-ink/5"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <ChevronDownIcon
                                className={cn(
                                  "size-3 shrink-0 text-ink-soft transition-transform duration-fast ease-soft",
                                  qOpen && "rotate-180",
                                )}
                              />
                              <span className="truncate text-ink-soft">{q.prompt}</span>
                            </span>
                            <span className="shrink-0 text-ink">{myScore ?? "—"}</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-4 py-2 pl-10 pr-4 text-sm">
                            <span className="truncate text-ink-soft">{q.prompt}</span>
                            <span className="shrink-0 text-ink">{myScore ?? "—"}</span>
                          </div>
                        )}
                        {answer && qOpen && (
                          <p className="whitespace-pre-wrap py-2 pl-[3.75rem] pr-4 text-sm leading-relaxed text-ink">
                            {answer}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
