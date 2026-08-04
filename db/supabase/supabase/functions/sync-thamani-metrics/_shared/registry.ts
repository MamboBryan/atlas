import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { MetricRow } from "./types.ts";
import { accountsNew } from "../metrics/accounts_new.ts";

export type MetricDef = {
  metric_key: string;
  compute: (thamani: SupabaseClient, now: Date) => Promise<MetricRow[]>;
};

/** Every metric synced from Thamani prod. Add new metrics here. */
export const METRICS: MetricDef[] = [accountsNew];
