import { periodStart, previousPeriodStart } from "@/lib/thamani/periods";
import { ACCOUNTS_NEW } from "@/lib/thamani/metrics/accounts";
import type { Grain, MetricRow } from "@/lib/thamani/types";

export type CurrentValues = {
  today: number;
  week: number;
  month: number;
  quarter: number;
  year: number;
};

const GRAIN_TO_KEY: Record<Grain, keyof CurrentValues> = {
  day: "today",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};

export type MinimalClient = { from: (table: string) => any };

export function pickCurrent(rows: MetricRow[], now: Date): CurrentValues {
  const out: CurrentValues = { today: 0, week: 0, month: 0, quarter: 0, year: 0 };
  for (const grain of Object.keys(GRAIN_TO_KEY) as Grain[]) {
    const wanted = periodStart(now, grain);
    const hit = rows.find(
      (r) => r.grain === grain && r.period_start === wanted,
    );
    if (hit) out[GRAIN_TO_KEY[grain]] = Number(hit.value);
  }
  return out;
}

export async function getAccountsMonthly(
  supabase: MinimalClient,
  year: number,
): Promise<{ period_start: string; value: number }[]> {
  const { data } = await supabase
    .from("thamani_metrics")
    .select("period_start,value")
    .eq("metric_key", ACCOUNTS_NEW)
    .eq("grain", "month")
    .gte("period_start", `${year}-01-01`)
    .lt("period_start", `${year + 1}-01-01`)
    .order("period_start", { ascending: true });
  return ((data ?? []) as { period_start: string; value: number }[]).map((r) => ({
    period_start: r.period_start,
    value: Number(r.value),
  }));
}

export type Trend = "up" | "down" | "flat";

export function trendDirection(current: number, previous: number): Trend {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

export function pickPrevious(rows: MetricRow[], now: Date): CurrentValues {
  const out: CurrentValues = { today: 0, week: 0, month: 0, quarter: 0, year: 0 };
  for (const grain of Object.keys(GRAIN_TO_KEY) as Grain[]) {
    const wanted = previousPeriodStart(now, grain);
    const hit = rows.find((r) => r.grain === grain && r.period_start === wanted);
    if (hit) out[GRAIN_TO_KEY[grain]] = Number(hit.value);
  }
  return out;
}

export async function getAccountsSnapshot(
  supabase: MinimalClient,
  now: Date,
): Promise<{ current: CurrentValues; previous: CurrentValues }> {
  const { data } = await supabase
    .from("thamani_metrics")
    .select("metric_key,grain,period_start,value")
    .eq("metric_key", ACCOUNTS_NEW);
  const rows = (data ?? []) as MetricRow[];
  return { current: pickCurrent(rows, now), previous: pickPrevious(rows, now) };
}
