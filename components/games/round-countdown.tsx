"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function RoundCountdown({
  endsAt,
  totalMs,
  onExpire,
}: {
  endsAt: string;
  totalMs: number;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const endMs = new Date(endsAt).getTime();
  const remainMs = Math.max(0, endMs - now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remainMs === 0) onExpire?.();
  }, [remainMs, onExpire]);

  const pct = Math.max(0, Math.min(100, (remainMs / totalMs) * 100));
  const tone =
    remainMs <= 5_000 ? "bg-red-500" : remainMs <= 15_000 ? "bg-amber-500" : "bg-primary";
  const seconds = Math.ceil(remainMs / 1000);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Time left</span>
        <span className="tabular-nums font-medium">{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-[width] duration-200 ease-linear", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
