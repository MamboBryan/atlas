---
name: thamani-metrics-aggregation
description: Use when adding a new pre-aggregated metric sourced from the Thamani production database into atlas's thamani_metrics table (e.g. new devices per period, active users, transaction counts). Covers the metric registry, the Supabase Edge Function + pg_cron pipeline, and verification. Triggers on "add a metric", "aggregate from Thamani", "new growth metric", or editing db/supabase/supabase/functions/sync-thamani-metrics.
---

# Thamani Metrics Aggregation Blueprint

Adds a new aggregation from **Thamani prod** into atlas `public.thamani_metrics`,
read by the growth dashboard. The pipeline is a `MetricDef[]` registry run every
10 minutes by pg_cron → Edge Function `sync-thamani-metrics`. Design rationale and
full context: `docs/superpowers/specs/2026-08-04-thamani-metrics-supabase-cron-design.md`.

## When NOT to use
- Metrics computed from atlas's OWN tables (meetings, prompts) — those can aggregate
  in-DB with plain SQL; no Edge Function needed.
- One-off analytics queries — this is for recurring, dashboard-backed metrics.

## Steps

1. **Name it.** Pick a `metric_key` (snake_case, e.g. `devices_new`) and decide what
   one row counts and at which grains (the standard set is day/week/month/quarter/year,
   current + previous period).

2. **Add the metric module** at
   `db/supabase/supabase/functions/sync-thamani-metrics/metrics/<key>.ts`.
   - Count-of-rows-by-timestamp (the common case):
     ```ts
     import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
     import { pageAll } from "../_shared/pageAll.ts";
     import { bucketCounts } from "../_shared/aggregate.ts";
     import type { MetricRow } from "../_shared/types.ts";

     export const devicesNew = {
       metric_key: "devices_new",
       compute: async (thamani: SupabaseClient, now: Date): Promise<MetricRow[]> =>
         bucketCounts("devices_new", await pageAll(thamani, "devices", "created_at"), now),
     };
     ```
   - Sum / distinct / custom: write a bespoke `compute` using `pageAll` (or your own
     query) plus the helpers in `_shared/periods.ts` (`computeSet`, `comparisonSet`,
     `periodEndMs`). Return one `MetricRow` per `(grain, period_start)`, de-duplicated.

3. **Register it** in `_shared/registry.ts` — add to the `METRICS` array.

4. **Test it.** Add Deno assertions to `aggregate_test.ts` (mirror the accounts_new
   cases: a known input → expected per-grain counts, empty input → all-zero unique
   rows). Run `cd db/supabase/supabase/functions/sync-thamani-metrics && deno task test`.

5. **Deploy.** `pnpm supabase functions deploy sync-thamani-metrics --project-ref <atlas-ref>`.
   No new cron or infra — the existing */10 job runs the whole registry.

6. **(If surfacing on the dashboard)** add a read in `lib/thamani/read.ts` filtered by
   the new `metric_key` (follow `getAccountsSnapshot`), then a UI component. Always
   capture and `console.error` the query `error` — never swallow it.

7. **Verify.** Manually invoke the function (bearer = atlas service_role key), assert
   `upserted` grew, check `cron.job_run_details` for a `succeeded` run, and confirm the
   new rows: `select * from thamani_metrics where metric_key = '<key>' limit 20`.

## Guardrails
- The function authorizes callers by comparing the bearer to `SUPABASE_SERVICE_ROLE_KEY`
  (deployed with `verify_jwt = false`). Don't add anon-key access.
- Thamani credentials live only as Edge Function secrets — never commit or paste them.
- Upsert conflict target is always `metric_key,grain,period_start`.
- `_shared/types.ts` and `_shared/periods.ts` are copies of `lib/thamani/{types,periods}.ts`;
  if you change period math, change BOTH and update both test suites.
