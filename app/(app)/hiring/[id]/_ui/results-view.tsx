"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Cell = { question_id: string; prompt: string; avg: number | null };
type Cand = { candidate_id: string; display_name: string; overall: number | null; rank: number; cells: Cell[] };
type Results = { suppressed: boolean; rater_bucket: string; rater_count: number | null; candidates: Cand[] };

export function ResultsView({ results }: { results: Results }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (results.suppressed) {
    return (
      <EmptyState
        headline="Results are hidden"
        body={`Not enough evaluators to show results yet (${results.rater_bucket} raters).`}
      />
    );
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{results.rater_count} evaluators</p>

      <Card size="sm" className="gap-0 py-0">
        {/* Header row */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <span>Candidate</span>
          <span>Score</span>
        </div>

        {results.candidates.map((c) => {
          const isOpen = open.has(c.candidate_id);
          return (
            <div key={c.candidate_id} className="border-b border-ink/10 last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(c.candidate_id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors duration-fast ease-soft hover:bg-ink/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-ink-soft transition-transform duration-fast ease-soft",
                      isOpen && "rotate-180",
                    )}
                  />
                  <span className="truncate font-display text-base font-extrabold text-ink">
                    #{c.rank} {c.display_name}
                  </span>
                </span>
                <span className="shrink-0 font-display text-xl font-extrabold text-ink">
                  {c.overall ?? "—"}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-1 border-t border-ink/10 bg-ink/[0.02] px-6 py-3 pl-12">
                  {c.cells.map((cell) => (
                    <div
                      key={cell.question_id}
                      className="flex justify-between gap-4 text-sm text-ink-soft"
                    >
                      <span className="truncate">{cell.prompt}</span>
                      <span className="shrink-0 text-ink">{cell.avg ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
