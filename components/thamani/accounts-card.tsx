import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";

export function TrendArrow({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const dir = trendDirection(current, previous);
  if (dir === "up")
    return (
      <HugeiconsIcon
        icon={ArrowUp02Icon}
        size={16}
        strokeWidth={2.5}
        className="text-emerald-600 dark:text-emerald-400"
        aria-label="up"
      />
    );
  if (dir === "down")
    return (
      <HugeiconsIcon
        icon={ArrowDown02Icon}
        size={16}
        strokeWidth={2.5}
        className="text-rose-600 dark:text-rose-400"
        aria-label="down"
      />
    );
  return (
    <span className="text-ink-soft text-sm" aria-label="no change">
      –
    </span>
  );
}

function Stat({
  label,
  value,
  previous,
}: {
  label: string;
  value: number;
  previous: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-1">
        <span className="font-display text-xl font-extrabold text-ink tabular-nums">
          {value}
        </span>
        <TrendArrow current={value} previous={previous} />
      </span>
    </div>
  );
}

export function AccountsCard({
  current,
  previous,
}: {
  current: CurrentValues;
  previous: CurrentValues;
}) {
  return (
    <Card interactive>
      <CardHeader>
        <CardTitle>New accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-ink/10">
          <Stat label="Today" value={current.today} previous={previous.today} />
          <Stat
            label="This week"
            value={current.week}
            previous={previous.week}
          />
          <Stat
            label="This month"
            value={current.month}
            previous={previous.month}
          />
          <Stat
            label="This quarter"
            value={current.quarter}
            previous={previous.quarter}
          />
          <Stat label="This year" value={current.year} previous={previous.year} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">Tap for details</p>
      </CardContent>
    </Card>
  );
}
