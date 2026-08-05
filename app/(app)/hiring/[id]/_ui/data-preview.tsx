"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Question = { id: string; prompt: string; is_hidden: boolean };
type Candidate = { id: string; display_name: string };
type Answer = {
  candidate_id: string;
  question_id: string;
  answer_text: string | null;
};

const PAGE_SIZE = 15;

// Read-only preview of imported data for owners before an evaluation opens:
// a candidate list whose rows expand to show each candidate's answers per
// field. Deliberately score-free — this is a "does the import look right?"
// check, not results.
export function DataPreview({
  candidates,
  questions,
  answers,
}: {
  candidates: Candidate[];
  questions: Question[];
  answers: Answer[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const answerFor = new Map<string, string>();
  for (const a of answers) {
    const t = a.answer_text?.trim();
    if (t) answerFor.set(`${a.candidate_id}|${a.question_id}`, t);
  }
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const total = candidates.length;
  const paginated = total > PAGE_SIZE;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const shown = paginated
    ? candidates.slice(start, start + PAGE_SIZE)
    : candidates;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Imported data preview — {total} candidate{total === 1 ? "" : "s"},{" "}
        {questions.length} field{questions.length === 1 ? "" : "s"}. Not open
        for evaluation yet.
      </p>
      <Card size="sm" className="gap-0 py-0">
        {shown.map((c) => {
          const isOpen = open.has(c.id);
          return (
            <div key={c.id} className="border-b border-divider last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors duration-fast ease-soft hover:bg-ink/5"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-4 shrink-0 text-ink-soft transition-transform duration-fast ease-soft",
                    isOpen && "rotate-180",
                  )}
                />
                <span className="truncate text-sm font-extrabold text-ink">
                  {c.display_name}
                </span>
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-med ease-soft",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div
                  className="overflow-hidden"
                  inert={!isOpen}
                  aria-hidden={!isOpen}
                >
                  <div className="border-t border-divider bg-surface">
                    {questions.map((q) => {
                      const ans = answerFor.get(`${c.id}|${q.id}`);
                      return (
                        <div
                          key={q.id}
                          className="border-b border-divider px-4 py-2 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">
                              {q.prompt}
                            </span>
                            {q.is_hidden && (
                              <Badge
                                size="sm"
                                variant="outline"
                                className="border-ink/40"
                              >
                                Context
                              </Badge>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap pt-1 text-sm leading-relaxed text-ink-soft">
                            {ans ?? "—"}
                          </p>
                        </div>
                      );
                    })}
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
