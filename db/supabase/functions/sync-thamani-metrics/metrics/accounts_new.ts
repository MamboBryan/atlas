import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pageAll } from "../_shared/pageAll.ts";
import { bucketCounts } from "../_shared/aggregate.ts";
import type { MetricRow } from "../_shared/types.ts";

export const accountsNew = {
  metric_key: "accounts_new",
  compute: async (thamani: SupabaseClient, now: Date): Promise<MetricRow[]> =>
    bucketCounts(
      "accounts_new",
      await pageAll(thamani, "accounts", "created_at"),
      now,
    ),
};
