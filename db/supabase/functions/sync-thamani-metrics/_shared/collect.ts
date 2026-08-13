import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { MetricDef } from "./registry.ts";
import type { MetricRow } from "./types.ts";

export type Failure = { metric_key: string; error: string };

export type Collected = {
  rows: MetricRow[];
  failed: Failure[];
};

/**
 * Compute every metric, isolating failures. One metric that throws — a rotated
 * Thamani credential, a table it can no longer read — must not take the whole
 * sync down with it: the healthy metrics still get written, and the broken one
 * is reported so the caller can surface it.
 *
 * A failing metric contributes NO rows rather than zeroed ones. Writing zeros
 * would read as "nothing happened this period" on the dashboard, which is a
 * worse lie than a stale value.
 */
export async function collectRows(
  metrics: MetricDef[],
  thamani: SupabaseClient,
  now: Date,
): Promise<Collected> {
  const settled = await Promise.all(
    metrics.map(async (m): Promise<Collected> => {
      try {
        return { rows: await m.compute(thamani, now), failed: [] };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`metric ${m.metric_key} failed:`, error);
        return { rows: [], failed: [{ metric_key: m.metric_key, error }] };
      }
    }),
  );

  return {
    rows: settled.flatMap((s) => s.rows),
    failed: settled.flatMap((s) => s.failed),
  };
}
