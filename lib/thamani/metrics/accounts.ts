import { computeSet, comparisonSet, periodEndMs } from "@/lib/thamani/periods";
import type { MetricRow } from "@/lib/thamani/types";

export const ACCOUNTS_NEW = "accounts_new";

export function bucketAccounts(createdAts: string[], now: Date): MetricRow[] {
  const times = createdAts
    .map((c) => Date.parse(c))
    .filter((t) => !Number.isNaN(t));

  const seen = new Set<string>();
  const periods = [...computeSet(now), ...comparisonSet(now)].filter((p) => {
    const key = `${p.grain}|${p.period_start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return periods.map(({ grain, period_start }) => {
    const startMs = Date.parse(`${period_start}T00:00:00Z`);
    const endMs = periodEndMs(grain, period_start);
    const value = times.filter((t) => t >= startMs && t < endMs).length;
    return { metric_key: ACCOUNTS_NEW, grain, period_start, value };
  });
}
