import { computeSet, comparisonSet, periodEndMs } from "./periods.ts";
import type { MetricRow } from "./types.ts";

/**
 * Bucket a list of ISO timestamps into per-period counts, tagged with `metricKey`.
 * Generalized from the app's bucketAccounts: covers the current period set plus the
 * previous-period comparison buckets, de-duplicated by (grain, period_start).
 */
export function bucketCounts(
  metricKey: string,
  values: string[],
  now: Date,
): MetricRow[] {
  const times = values
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
    return { metric_key: metricKey, grain, period_start, value };
  });
}
