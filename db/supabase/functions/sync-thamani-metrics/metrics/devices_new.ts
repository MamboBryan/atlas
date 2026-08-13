import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pageAll } from "../_shared/pageAll.ts";
import { bucketCounts } from "../_shared/aggregate.ts";
import type { MetricRow } from "../_shared/types.ts";

export const devicesNew = {
  metric_key: "devices_new",
  compute: async (thamani: SupabaseClient, now: Date): Promise<MetricRow[]> =>
    bucketCounts(
      "devices_new",
      await pageAll(thamani, "devices", "created_at"),
      now,
    ),
};
