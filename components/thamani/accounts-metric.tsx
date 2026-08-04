"use client";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AccountsCard,
  TrendArrow,
  PrevBadge,
} from "@/components/thamani/accounts-card";
import { AccountsChart } from "@/components/thamani/accounts-chart";
import { AccountsCompare } from "@/components/thamani/accounts-compare";
import type { CurrentValues } from "@/lib/thamani/read";

const ROLLUPS: { key: keyof CurrentValues; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

export function AccountsMetric({
  current,
  previous,
  monthly,
  daily,
  year,
}: {
  current: CurrentValues;
  previous: CurrentValues;
  monthly: { period_start: string; value: number }[];
  daily: { date: string; value: number }[];
  year: number;
}) {
  const byMonth = new Map(
    monthly.map((m) => [Number(m.period_start.slice(5, 7)) - 1, m.value]),
  );
  const now = new Date();
  const monthsToShow = year < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1;
  const values = Array.from(
    { length: monthsToShow },
    (_, i) => byMonth.get(i) ?? 0,
  );

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="block w-full text-left sm:w-80"
          />
        }
      >
        <AccountsCard current={current} previous={previous} />
      </DialogTrigger>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-y-auto sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle>New accounts</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ROLLUPS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {label}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-2xl font-extrabold text-ink tabular-nums">
                    {current[key]}
                  </span>
                  <TrendArrow current={current[key]} previous={previous[key]} />
                  <PrevBadge current={current[key]} previous={previous[key]} />
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
              {year} · month by month
            </div>
            <AccountsChart values={values} year={year} />
          </div>

          <AccountsCompare daily={daily} year={year} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
