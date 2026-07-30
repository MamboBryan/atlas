import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trendDirection, type CurrentValues } from "@/lib/thamani/read";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons";

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function TrendArrow({ current, previous }: { current: number; previous: number }) {
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
  return <span className="text-ink-soft text-sm" aria-label="no change">–</span>;
}

function Stat({ label, value, previous }: { label: string; value: number; previous: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
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

  const W = 320;
  const H = 96;
  const padX = 8;
  const padTop = 12;
  const padBottom = 10;
  const xAt = (i: number) => padX + (i / 11) * (W - 2 * padX);
  const yAt = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const linePoints = MONTH_LABELS.map((_, i) => `${xAt(i).toFixed(1)},${yAt(byMonth.get(i) ?? 0).toFixed(1)}`).join(" ");
  const bandW = (W - 2 * padX) / 11;

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
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-24 text-accent"
            role="img"
            aria-label={`New accounts per month in ${year}`}
          >
            <polyline
              points={linePoints}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {MONTH_LABELS.map((label, i) => {
              const v = byMonth.get(i) ?? 0;
              const prev = i > 0 ? byMonth.get(i - 1) ?? 0 : null;
              const delta = prev === null ? null : v - prev;
              const tip =
                prev === null
                  ? `${label}: ${v}`
                  : `${label}: ${v} · ${delta! >= 0 ? "+" : ""}${delta} vs ${MONTH_LABELS[i - 1]}`;
              return (
                <rect
                  key={label}
                  x={Math.max(0, xAt(i) - bandW / 2)}
                  y={0}
                  width={bandW}
                  height={H}
                  fill="transparent"
                >
                  <title>{tip}</title>
                </rect>
              );
            })}
          </svg>
          <div className="flex px-1 text-[10px] text-ink-soft">
            {MONTH_LABELS.map((l) => (
              <span key={l} className="flex-1 text-center">
                {l}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
