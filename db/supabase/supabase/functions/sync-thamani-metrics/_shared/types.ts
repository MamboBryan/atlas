export type Grain = "day" | "week" | "month" | "quarter" | "year";

export type MetricRow = {
  metric_key: string;
  grain: Grain;
  period_start: string; // YYYY-MM-DD, first day of the period (UTC)
  value: number;
};
