"use client";
import { useState, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RoundCountdown } from "./round-countdown";
import { submitTargetNumberAction } from "@/lib/actions/game";
import type { TargetNumberOp } from "@/lib/games/types";
import { TARGET_NUMBER_DURATION_MS } from "@/lib/games/target-number";

type Chip = { key: string; value: number; consumed: boolean; fromStep: number | null };

export function TargetNumberRound({
  roundId,
  target,
  bases,
  endsAt,
}: {
  roundId: string;
  target: number;
  bases: number[];
  endsAt: string;
}) {
  const [chips, setChips] = useState<Chip[]>(() =>
    bases.map((v, i) => ({ key: `b${i}`, value: v, consumed: false, fromStep: null })),
  );
  const [selectedLeft, setSelectedLeft] = useState<Chip | null>(null);
  const [selectedOp, setSelectedOp] = useState<TargetNumberOp["op"] | null>(null);
  const [expression, setExpression] = useState<TargetNumberOp[]>([]);
  const [bestResult, setBestResult] = useState<number | null>(null);
  const [pending, startTx] = useTransition();

  const activeChips = useMemo(() => chips.filter((c) => !c.consumed), [chips]);

  function pickChip(chip: Chip) {
    if (!selectedLeft) {
      setSelectedLeft(chip);
      return;
    }
    if (!selectedOp) return; // must choose op first
    const a = selectedLeft.value;
    const b = chip.value;
    const result = applyOp(selectedOp, a, b);
    if (result == null || !Number.isInteger(result) || result <= 0) {
      toast.error("Invalid step (fractions and negatives not allowed).");
      setSelectedLeft(null);
      setSelectedOp(null);
      return;
    }
    const step: TargetNumberOp = { op: selectedOp, left: a, right: b, result };
    setChips((prev) => {
      const next = prev.map((c) =>
        c.key === selectedLeft.key || c.key === chip.key ? { ...c, consumed: true } : c,
      );
      next.push({
        key: `s${expression.length}`,
        value: result,
        consumed: false,
        fromStep: expression.length,
      });
      return next;
    });
    setExpression((prev) => [...prev, step]);
    setSelectedLeft(null);
    setSelectedOp(null);
  }

  function undoLast() {
    if (expression.length === 0) return;
    const last = expression[expression.length - 1];
    setExpression((prev) => prev.slice(0, -1));
    setChips((prev) => {
      const withoutResult = prev.filter((c) => c.fromStep !== expression.length - 1);
      return withoutResult.map((c) =>
        c.value === last.left || c.value === last.right ? { ...c, consumed: false } : c,
      );
    });
    setSelectedLeft(null);
    setSelectedOp(null);
  }

  function submit() {
    if (expression.length === 0) return;
    const currentResult = expression[expression.length - 1].result;
    startTx(async () => {
      const res = await submitTargetNumberAction({ round_id: roundId, expression });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      if (res.data.better) setBestResult(currentResult);
      toast.success(
        res.data.better
          ? `New best: ${currentResult} (distance ${Math.abs(target - currentResult)})`
          : "Not better than your current best.",
      );
    });
  }

  return (
    <div className="space-y-4">
      <RoundCountdown endsAt={endsAt} totalMs={TARGET_NUMBER_DURATION_MS} />
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
          <div className="text-4xl font-bold tabular-nums">{target}</div>
        </div>
        {bestResult !== null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your best</div>
            <div className="text-2xl font-semibold tabular-nums">{bestResult}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {activeChips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickChip(c)}
            className={`rounded-md border px-3 py-2 font-mono text-lg ${
              selectedLeft?.key === c.key ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            {c.value}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["+", "-", "*", "/"] as const).map((op) => (
          <Button
            key={op}
            type="button"
            variant={selectedOp === op ? "default" : "outline"}
            onClick={() => setSelectedOp(op)}
            disabled={!selectedLeft}
          >
            {op}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={undoLast} disabled={expression.length === 0}>
          Undo
        </Button>
        <Button type="button" onClick={submit} disabled={expression.length === 0 || pending}>
          Submit
        </Button>
      </div>

      {expression.length > 0 && (
        <ol className="rounded-md bg-muted/50 p-3 font-mono text-sm">
          {expression.map((s, i) => (
            <li key={i}>
              {s.left} {s.op} {s.right} = <strong>{s.result}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function applyOp(op: TargetNumberOp["op"], a: number, b: number): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b > 0 ? a - b : null;
    case "*":
      return a * b;
    case "/":
      if (b === 0 || a % b !== 0) return null;
      return a / b;
  }
}
