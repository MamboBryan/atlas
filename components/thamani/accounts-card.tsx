import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";
import { AccountsChart } from "@/components/thamani/accounts-chart";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";

function TrendArrow({
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
  monthly,
  year,
}: {
  current: CurrentValues;
  previous: CurrentValues;
  monthly: { period_start: string; value: number }[];
  year: number;
}) {
  const byMonth = new Map(
    monthly.map((m) => [Number(m.period_start.slice(5, 7)) - 1, m.value]),
  );
  // Only plot up to the current month for the ongoing year; a past year shows all 12.
  const now = new Date();
  const monthsToShow = year < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1;
  const values = Array.from(
    { length: monthsToShow },
    (_, i) => byMonth.get(i) ?? 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>New accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex flex-col divide-y divide-ink/10 sm:w-44 sm:shrink-0">
            <Stat
              label="Today"
              value={current.today}
              previous={previous.today}
            />
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

          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
              {year} · month by month
            </div>
            <AccountsChart values={values} year={year} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
