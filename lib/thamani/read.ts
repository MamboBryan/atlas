import { periodStart, previousPeriodStart } from "@/lib/thamani/periods";
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
  const out: CurrentValues = {
    today: 0,
    week: 0,
    month: 0,
    quarter: 0,
    year: 0,
  };
  for (const grain of Object.keys(GRAIN_TO_KEY) as Grain[]) {
    const wanted = periodStart(now, grain);
    const hit = rows.find(
      (r) => r.grain === grain && r.period_start === wanted,
    );
    if (hit) out[GRAIN_TO_KEY[grain]] = Number(hit.value);
  }
  return out;
}

export type Trend = "up" | "down" | "flat";

export function trendDirection(current: number, previous: number): Trend {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

export function pickPrevious(rows: MetricRow[], now: Date): CurrentValues {
  const out: CurrentValues = {
    today: 0,
    week: 0,
    month: 0,
    quarter: 0,
    year: 0,
  };
  for (const grain of Object.keys(GRAIN_TO_KEY) as Grain[]) {
    const wanted = previousPeriodStart(now, grain);
    const hit = rows.find(
      (r) => r.grain === grain && r.period_start === wanted,
    );
    if (hit) out[GRAIN_TO_KEY[grain]] = Number(hit.value);
  }
  return out;
}

/** Never swallow a read error — a silent empty result reads as "zero growth". */
function logError(
  metricKey: string,
  what: string,
  error: { message: string } | null,
) {
  if (error) {
    console.error(
      `thamani_metrics read failed (${metricKey} ${what}):`,
      error.message,
    );
  }
}

/** Current + previous period values for every grain of one metric. */
export async function getMetricSnapshot(
  supabase: MinimalClient,
  metricKey: string,
  now: Date,
): Promise<{ current: CurrentValues; previous: CurrentValues }> {
  const { data, error } = await supabase
    .from("thamani_metrics")
    .select("metric_key,grain,period_start,value")
    .eq("metric_key", metricKey);
  logError(metricKey, "snapshot", error);
  const rows = (data ?? []) as MetricRow[];
  return { current: pickCurrent(rows, now), previous: pickPrevious(rows, now) };
}

/** Month-grain series for one metric across a calendar year. */
export async function getMetricMonthly(
  supabase: MinimalClient,
  metricKey: string,
  year: number,
): Promise<{ period_start: string; value: number }[]> {
  const { data, error } = await supabase
    .from("thamani_metrics")
    .select("period_start,value")
    .eq("metric_key", metricKey)
    .eq("grain", "month")
    .gte("period_start", `${year}-01-01`)
    .lt("period_start", `${year + 1}-01-01`)
    .order("period_start", { ascending: true });
  logError(metricKey, "monthly", error);
  return ((data ?? []) as { period_start: string; value: number }[]).map(
    (r) => ({
      period_start: r.period_start,
      value: Number(r.value),
    }),
  );
}

/** Day-grain series for one metric across a calendar year. */
export async function getMetricDaily(
  supabase: MinimalClient,
  metricKey: string,
  year: number,
): Promise<{ date: string; value: number }[]> {
  const { data, error } = await supabase
    .from("thamani_metrics")
    .select("period_start,value")
    .eq("metric_key", metricKey)
    .eq("grain", "day")
    .gte("period_start", `${year}-01-01`)
    .lt("period_start", `${year + 1}-01-01`)
    .order("period_start", { ascending: true });
  logError(metricKey, "daily", error);
  return ((data ?? []) as { period_start: string; value: number }[]).map(
    (r) => ({ date: r.period_start, value: Number(r.value) }),
  );
}

export type MetricSeries = {
  current: CurrentValues;
  previous: CurrentValues;
  monthly: { period_start: string; value: number }[];
  daily: { date: string; value: number }[];
};

/** Everything the dashboard panel needs for one metric, in one round trip set. */
export async function getMetricSeries(
  supabase: MinimalClient,
  metricKey: string,
  now: Date,
  year: number,
): Promise<MetricSeries> {
  const [{ current, previous }, monthly, daily] = await Promise.all([
    getMetricSnapshot(supabase, metricKey, now),
    getMetricMonthly(supabase, metricKey, year),
    getMetricDaily(supabase, metricKey, year),
  ]);
  return { current, previous, monthly, daily };
}
