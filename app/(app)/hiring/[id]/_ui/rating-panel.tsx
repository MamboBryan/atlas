"use client";
import { useState, useTransition } from "react";
import { rateAnswerAction } from "@/lib/actions/evaluation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [clicked, setClicked] = useState<Record<string, number>>({});
  const answerFor = (cid: string, qid: string) =>
    answers.find((a) => a.candidate_id === cid && a.question_id === qid)?.answer_text ?? "—";
  const cellKey = (cid: string, qid: string) => `${cid}:${qid}`;

  return (
    <div className="space-y-8">
      {candidates.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>{c.display_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {questions.map((q) => {
              const key = cellKey(c.id, q.id);
              const selected = clicked[key];
              return (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-semibold text-ink">{q.prompt}</p>
                  <p className="whitespace-pre-wrap text-sm text-ink-soft">{answerFor(c.id, q.id)}</p>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="icon-sm"
                        variant={selected === s ? "default" : "outline"}
                        onClick={() => {
                          setClicked((prev) => ({ ...prev, [key]: s }));
                          start(() => rateAnswerAction({
                            evaluationId, candidateId: c.id, questionId: q.id, score: s,
                          }).then(() => {}));
                        }}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
