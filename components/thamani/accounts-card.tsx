import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const dir = trendDirection(current, previous);
  if (dir === "up")
    return <span className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold" aria-label="up">▲</span>;
  if (dir === "down")
    return <span className="text-rose-600 dark:text-rose-400 text-sm font-semibold" aria-label="down">▼</span>;
  return <span className="text-ink-soft text-sm" aria-label="no change">–</span>;
}

function Stat({ label, value, previous }: { label: string; value: number; previous: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-extrabold text-ink">{value}</span>
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
  const max = Math.max(1, ...monthly.map((m) => m.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>New accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Today" value={current.today} previous={previous.today} />
          <Stat label="This week" value={current.week} previous={previous.week} />
          <Stat label="This month" value={current.month} previous={previous.month} />
          <Stat label="This quarter" value={current.quarter} previous={previous.quarter} />
          <Stat label="This year" value={current.year} previous={previous.year} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            {year} · month by month
          </div>
          <div className="flex items-end gap-1.5 h-24">
            {MONTH_LABELS.map((label, i) => {
              const v = byMonth.get(i) ?? 0;
              return (
                <div key={label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-accent/70"
                      style={{ height: `${(v / max) * 100}%` }}
                      title={`${label}: ${v}`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-soft">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
