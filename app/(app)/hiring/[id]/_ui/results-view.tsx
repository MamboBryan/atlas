"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = { candidate_id: string; display_name: string; overall: number | null; rank: number; cells: Cell[] };
type Results = { suppressed: boolean; rater_bucket: string; rater_count: number | null; candidates: Cand[] };
type Answer = { candidate_id: string; question_id: string; answer_text: string | null };

const PAGE_SIZE = 10;

export function ResultsView({
  results,
  answers = [],
}: {
  results: Results;
  answers?: Answer[];
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
      <p className="text-sm text-ink-soft">{results.rater_count} evaluators</p>

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
                className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors duration-fast ease-soft hover:bg-ink/5"
              >
                <span className="flex min-w-0 items-center gap-2">
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
                <span className="shrink-0 font-display text-lg font-extrabold text-ink">
                  {c.overall ?? "—"}
                </span>
              </button>

              {isOpen && (
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
                </div>
              )}
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
