import { computeSet, comparisonSet, periodEndMs } from "@/lib/thamani/periods";
import type { MetricRow } from "@/lib/thamani/types";
import { thamaniReadClient } from "@/lib/supabase/thamani";

export const ACCOUNTS_NEW = "accounts_new";

export function bucketAccounts(createdAts: string[], now: Date): MetricRow[] {
  const times = createdAts.map((c) => Date.parse(c)).filter((t) => !Number.isNaN(t));

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

/**
 * Reads every account's created_at from Thamani prod and buckets it.
 * NOTE: assumes the `accounts` table has a `created_at` timestamp column.
 * If the column is named differently, adjust the .select() below.
 */
export async function computeAccountsMetrics(now: Date): Promise<MetricRow[]> {
  const client = thamaniReadClient();
  const { data, error } = await client.from("accounts").select("created_at");
  if (error) {
    throw new Error(`Thamani accounts read failed: ${error.message}`);
  }
  const createdAts = (data ?? [])
    .map((r) => (r as { created_at: string | null }).created_at)
    .filter((c): c is string => !!c);
  return bucketAccounts(createdAts, now);
}
