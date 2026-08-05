import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";

/**
 * Previous-period value as a soft-filled pill, tinted by the trend vs
 * `current`: green when up, red when down, neutral when flat.
 */
export function PrevBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const dir = trendDirection(current, previous);
  const tone =
    dir === "up"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
      : dir === "down"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
      aria-label={`previous ${previous}`}
    >
      {previous}
    </span>
  );
}

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
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-display text-base font-extrabold text-ink tabular-nums">
          {value}
        </span>
        <TrendArrow current={value} previous={previous} />
        <PrevBadge current={value} previous={previous} />
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
    <Card interactive size="sm">
      <CardHeader>
        <CardTitle>New accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
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
          <Stat
            label="This year"
            value={current.year}
            previous={previous.year}
          />
        </div>
        <p className="mt-3 text-[11px] text-ink-soft">Tap for details</p>
      </CardContent>
    </Card>
  );
}
