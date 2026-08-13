"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Selection,
  selectionCount,
  selectionDays,
  overlappingIndices,
} from "@/lib/thamani/compare";

type Mode = "single" | "multiple" | "range";

const MODES: { key: Mode; label: string }[] = [
  { key: "single", label: "Single dates" },
  { key: "multiple", label: "Multiple dates" },
  { key: "range", label: "Date ranges" },
];

const MAX_SELECTIONS = 4;

function emptySelection(mode: Mode): Selection {
  if (mode === "single") return { kind: "single", date: "" };
  if (mode === "multiple") return { kind: "multiple", dates: [""] };
  return { kind: "range", from: "", to: "" };
}

function describe(sel: Selection): string {
  if (sel.kind === "single") return sel.date || "—";
  if (sel.kind === "multiple") {
    const n = selectionDays(sel).length;
    return n === 1 ? "1 date" : `${n} dates`;
  }
  return sel.from && sel.to ? `${sel.from} → ${sel.to}` : "—";
}

export function MetricCompare({
  daily,
  year,
}: {
  daily: { date: string; value: number }[];
  year: number;
}) {
  const [mode, setMode] = useState<Mode>("single");
  const [selections, setSelections] = useState<Selection[]>(() => [
    emptySelection("single"),
    emptySelection("single"),
  ]);
  // The comparison shown in the result — set only on Apply, cleared on any edit.
  const [applied, setApplied] = useState<Selection[] | null>(null);

  const dailyMap = useMemo(
    () => new Map(daily.map((row) => [row.date, row.value])),
    [daily],
  );
  const min = `${year}-01-01`;
  const max = new Date().toISOString().slice(0, 10);

  const overlaps = useMemo(
    () => new Set(overlappingIndices(selections)),
    [selections],
  );
  const allFilled = selections.every((s) => selectionDays(s).length > 0);
  const canApply = allFilled && overlaps.size === 0;

  // Any edit invalidates the applied result so stale bars never linger.
  function edit(next: Selection[]) {
    setSelections(next);
    setApplied(null);
  }
  function switchMode(next: Mode) {
    setMode(next);
    setSelections([emptySelection(next), emptySelection(next)]);
    setApplied(null);
  }
  function update(i: number, sel: Selection) {
    edit(selections.map((s, idx) => (idx === i ? sel : s)));
  }
  function addSelection() {
    if (selections.length >= MAX_SELECTIONS) return;
    edit([...selections, emptySelection(mode)]);
  }
  function removeSelection(i: number) {
    if (selections.length <= 2) return;
    edit(selections.filter((_, idx) => idx !== i));
  }
  function apply() {
    if (canApply) setApplied(selections);
  }
  function clear() {
    setSelections([emptySelection(mode), emptySelection(mode)]);
    setApplied(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          Compare
        </div>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={mode === m.key ? "accent" : "outline"}
              onClick={() => switchMode(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {selections.map((sel, i) => (
          <SelectionRow
            key={i}
            index={i}
            selection={sel}
            min={min}
            max={max}
            overlap={overlaps.has(i)}
            canRemove={selections.length > 2}
            onChange={(s) => update(i, s)}
            onRemove={() => removeSelection(i)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selections.length < MAX_SELECTIONS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addSelection}
          >
            ＋ Add selection
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={apply}
          disabled={!canApply}
        >
          Apply
        </Button>
      </div>

      {applied && applied.length > 0 ? (
        <ComparisonResult applied={applied} dailyMap={dailyMap} />
      ) : (
        <p className="text-[11px] text-ink-soft">
          Pick non-overlapping dates in {year}, then Apply to compare.
        </p>
      )}
    </div>
  );
}

function ComparisonResult({
  applied,
  dailyMap,
}: {
  applied: Selection[];
  dailyMap: Map<string, number>;
}) {
  const counts = applied.map((s) => selectionCount(dailyMap, s));
  const max = Math.max(1, ...counts);
  return (
    <div className="space-y-2.5 rounded-md border border-ink/10 bg-surface p-3">
      {applied.map((sel, i) => {
        const label = String.fromCharCode(65 + i); // A, B, C…
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span className="font-display text-sm font-bold text-ink">
                  {label}
                </span>
                <span className="tabular-nums">{describe(sel)}</span>
              </span>
              <span className="font-display text-sm font-bold text-ink tabular-nums">
                {counts[i]}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded bg-ink/5">
              <div
                className="h-full rounded bg-accent/70"
                style={{ width: `${(counts[i] / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SelectionRow({
  index,
  selection,
  min,
  max,
  overlap,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  selection: Selection;
  min: string;
  max: string;
  overlap: boolean;
  canRemove: boolean;
  onChange: (s: Selection) => void;
  onRemove: () => void;
}) {
  const label = String.fromCharCode(65 + index); // A, B, C…
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 font-display text-sm font-bold text-ink">
          {label}
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {selection.kind === "single" && (
            <Input
              type="date"
              min={min}
              max={max}
              value={selection.date}
              className="h-9 w-auto"
              onChange={(e) =>
                onChange({ kind: "single", date: e.target.value })
              }
            />
          )}
          {selection.kind === "multiple" && (
            <MultiDateEditor
              selection={selection}
              min={min}
              max={max}
              onChange={onChange}
            />
          )}
          {selection.kind === "range" && (
            <>
              <Input
                type="date"
                min={min}
                max={max}
                value={selection.from}
                className="h-9 w-auto"
                onChange={(e) =>
                  onChange({ ...selection, from: e.target.value })
                }
              />
              <span className="text-ink-soft">→</span>
              <Input
                type="date"
                min={min}
                max={max}
                value={selection.to}
                className="h-9 w-auto"
                onChange={(e) => onChange({ ...selection, to: e.target.value })}
              />
            </>
          )}
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove selection ${label}`}
          >
            ✕
          </Button>
        )}
      </div>
      {overlap && (
        <p className="pl-7 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          overlaps another selection
        </p>
      )}
    </div>
  );
}

function MultiDateEditor({
  selection,
  min,
  max,
  onChange,
}: {
  selection: { kind: "multiple"; dates: string[] };
  min: string;
  max: string;
  onChange: (s: Selection) => void;
}) {
  const setDate = (i: number, v: string) =>
    onChange({
      kind: "multiple",
      dates: selection.dates.map((d, idx) => (idx === i ? v : d)),
    });
  const addDate = () =>
    onChange({ kind: "multiple", dates: [...selection.dates, ""] });
  const removeDate = (i: number) =>
    onChange({
      kind: "multiple",
      dates: selection.dates.filter((_, idx) => idx !== i),
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selection.dates.map((d, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <Input
            type="date"
            min={min}
            max={max}
            value={d}
            className="h-9 w-auto"
            onChange={(e) => setDate(i, e.target.value)}
          />
          {selection.dates.length > 1 && (
            <button
              type="button"
              className="text-ink-soft hover:text-ink"
              aria-label="Remove date"
              onClick={() => removeDate(i)}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addDate}>
        ＋ date
      </Button>
    </div>
  );
}
