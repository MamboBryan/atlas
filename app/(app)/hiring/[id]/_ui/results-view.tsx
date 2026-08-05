"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = { candidate_id: string; display_name: string; overall: number | null; rank: number; cells: Cell[] };
type Results = { suppressed: boolean; rater_bucket: string; rater_count: number | null; candidates: Cand[] };
type Answer = { candidate_id: string; question_id: string; answer_text: string | null };
type EvaluatorScore = { name: string; overall: number };
type ContextQuestion = { question_id: string; prompt: string };
type ContextAnswer = { candidate_id: string; question_id: string; answer_text: string | null };
type ContextFields = { questions: ContextQuestion[]; answers: ContextAnswer[] };

const PAGE_SIZE = 10;

// Evaluator score → quality color, by nearest whole point on a red→green scale:
// 1 red · 2 light red · 3 orange · 4 light green · 5 green. Dark ink text reads
// on every band.
const SCORE_BAND_COLORS = ["#ff4b4b", "#ff9a9a", "#ffa733", "#b0e57c", "#58cc02"];
function scoreBandColor(score: number): string {
  const band = Math.min(5, Math.max(1, Math.round(score)));
  return SCORE_BAND_COLORS[band - 1];
}

export function ResultsView({
  results,
  answers = [],
  evaluators = {},
  contextFields = { questions: [], answers: [] },
}: {
  results: Results;
  answers?: Answer[];
  // Owner/admin-only, keyed by candidate_id. Absent/empty for other viewers.
  evaluators?: Record<string, EvaluatorScore[]>;
  // Hidden (unscored) fields, shown as read-only context. Empty for non-panelist viewers.
  contextFields?: ContextFields;
}) {
  const [openCand, setOpenCand] = useState<Set<string>>(new Set());
  const [openQ, setOpenQ] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  if (results.suppressed) {
    return (
      <EmptyState
        headline="Results are hidden"
        body={`Not enough evaluators to show results yet (${results.rater_bucket} raters).`}
      />
    );
  }

  // Answers are only fetched for admins/panelists; a question is expandable
  // only when we actually have its answer text.
  const answerFor = new Map<string, string>();
  for (const a of answers) {
    const text = a.answer_text?.trim();
    if (text) answerFor.set(`${a.candidate_id}|${a.question_id}`, text);
  }

  const contextAnswerFor = new Map<string, string>();
  for (const a of contextFields.answers) {
    const text = a.answer_text?.trim();
    if (text) contextAnswerFor.set(`${a.candidate_id}|${a.question_id}`, text);
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

  const total = results.candidates.length;
  const paginated = total > PAGE_SIZE;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const shown = paginated
    ? results.candidates.slice(start, start + PAGE_SIZE)
    : results.candidates;

  return (
    <div className="space-y-3">
      <Card size="sm" className="gap-0 py-0">
        {/* Header row */}
        <div className="flex items-center justify-between border-b border-divider px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          <span>Candidate</span>
          <span>Score</span>
        </div>

        {shown.map((c) => {
          const isOpen = openCand.has(c.candidate_id);
          return (
            <div key={c.candidate_id} className="border-b border-divider last:border-b-0">
              <button
                type="button"
                onClick={() => toggleCand(c.candidate_id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-soft hover:bg-ink/5"
              >
                <span className="flex min-w-0 shrink-0 items-center gap-2">
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-ink-soft transition-transform duration-fast ease-soft",
                      isOpen && "rotate-180",
                    )}
                  />
                  <span className="truncate text-sm font-extrabold text-ink">
                    #{c.rank} {c.display_name}
                  </span>
                </span>
                {/* Per-evaluator badges ride the candidate row, revealed only
                    when expanded (owner/admin-only data; empty otherwise). */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                  {isOpen &&
                    evaluators[c.candidate_id]?.map((e, i) => (
                      <Badge
                        key={`${e.name}-${i}`}
                        size="sm"
                        className="animate-in fade-in-0 slide-in-from-right-1 gap-1.5 py-0.5 pr-1 pl-2.5 font-medium text-ink-soft duration-med ease-soft"
                      >
                        <span className="truncate">{e.name}</span>
                        <span
                          className="rounded-full px-1.5 font-semibold tabular-nums text-[#111]"
                          style={{ backgroundColor: scoreBandColor(e.overall) }}
                        >
                          {e.overall}
                        </span>
                      </Badge>
                    ))}
                </span>
                <span className="shrink-0 font-display text-lg font-extrabold text-ink">
                  {c.overall ?? "—"}
                </span>
              </button>

              {/* Expandable body: grid-rows 0fr→1fr animates height with no JS
                  library. Content stays mounted so both expand and collapse
                  transition smoothly. */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-med ease-soft",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-divider bg-surface">
                  {c.cells.map((cell) => {
                    const key = `${c.candidate_id}|${cell.question_id}`;
                    const answer = answerFor.get(key);
                    const qOpen = openQ.has(key);
                    return (
                      <div key={cell.question_id} className="border-b border-divider last:border-b-0">
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
                              <span className="truncate text-ink-soft">{cell.prompt}</span>
                            </span>
                            <span className="shrink-0 text-ink">{cell.avg ?? "—"}</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-4 py-2 pl-10 pr-4 text-sm">
                            <span className="truncate text-ink-soft">{cell.prompt}</span>
                            <span className="shrink-0 text-ink">{cell.avg ?? "—"}</span>
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
                  {contextFields.questions.length > 0 && (
                    <div className="border-t border-divider">
                      <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                        Context (not scored)
                      </p>
                      {contextFields.questions.map((q) => {
                        const key = `ctx|${c.candidate_id}|${q.question_id}`;
                        const answer = contextAnswerFor.get(`${c.candidate_id}|${q.question_id}`);
                        const qOpen = openQ.has(key);
                        return (
                          <div key={q.question_id} className="border-b border-divider last:border-b-0">
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
                              </button>
                            ) : (
                              <div className="py-2 pl-10 pr-4 text-sm">
                                <span className="truncate text-ink-soft">{q.prompt}</span>
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
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {paginated && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-ink-soft">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
