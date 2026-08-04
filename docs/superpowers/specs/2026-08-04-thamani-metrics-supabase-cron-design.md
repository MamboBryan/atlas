# Thamani Metrics Sync — Supabase pg_cron + Edge Function

**Date:** 2026-08-04
**Status:** Design approved, pending spec review
**Branch:** feat/accounts-metric-dialog

## Problem

The Thamani growth dashboard reads pre-aggregated rows from `public.thamani_metrics`
in **atlas's own Supabase DB**. Those rows are populated locally but **empty in
production**, so every metric renders as zero.

### Root-cause investigation (evidence)

The metrics pipeline is code-complete and correct — this is a production
config/scheduling failure, not a code bug. Evidence gathered from prod:

- **Two-project split.** The `accounts` source lives in the **Thamani** project
  (`lxescgcuelttoxaacsib`). `thamani_metrics` lives in **atlas's own** DB — a
  separate project. The current Node cron bridges them over the network.
- **Prod cron returns `401 {"ok":false}`.** The route guard is
  `if (!process.env.CRON_SECRET || auth !== ...) return 401`. So in prod
  `CRON_SECRET` is unset or mismatched — meaning Vercel's own scheduled
  invocation is also rejected and nothing is ever written.
- **No `/api/cron/*` invocations in Vercel runtime logs** (2-day window shows only
  a single `/` hit). Consistent with the crons not firing. The project is on a
  personal/Hobby-style Vercel account (`mambobryans-projects`), where cron jobs
  are capped; `vercel.json` defines **5 crons with `thamani-metrics` last**.
- **The dashboard read swallows errors.** `lib/thamani/read.ts` does
  `const { data } = await supabase...` with no error check, so a missing table or
  failed read renders as all-zeros **silently** — which is why this went unnoticed.
- Migration `0024_thamani_metrics` may never have been applied to the atlas prod
  DB (unverifiable from here — atlas prod DB is not in the accessible Supabase org).

Any one of `CRON_SECRET` unset / cron not firing / migration not applied produces
exactly "works local, empty prod."

## Goal

Replace the fragile Vercel-cron trigger with a **Supabase-native** pipeline that
runs entirely on infra we control, every 10 minutes, with visible failure
reporting — while keeping the metric output **byte-identical** to today's so the
dashboard needs zero changes.

Non-goals (YAGNI): incremental aggregation, new metrics beyond `accounts_new`,
generalizing the metric framework.

## Architecture

```
pg_cron (atlas DB, */10 * * * *)
  └─ net.http_post → Edge Function  sync-thamani-metrics        [atlas project]
        ├─ read accounts.created_at from THAMANI prod   (URL + service key = fn secrets)
        ├─ bucket by period   (ported bucketAccounts + periods — identical logic)
        └─ upsert → atlas public.thamani_metrics
                    (onConflict: metric_key,grain,period_start)

Dashboard  →  reads thamani_metrics   (UNCHANGED)
```

The Edge Function is the same network bridge the current Node route is — only the
**trigger** (Vercel Cron → pg_cron) and **runtime** (Vercel serverless → Supabase
Edge) change. Aggregation stays in TypeScript because atlas's DB does not hold the
`accounts` rows, so a pure-SQL aggregate is not possible without a foreign-data
wrapper (deliberately avoided).

## Components

### 1. Edge Function `sync-thamani-metrics` (Deno/TypeScript, atlas project)

- JWT-verified (Supabase default). Only callers with a valid atlas JWT
  (the `service_role` key used by pg_cron) can invoke it.
- Reads Thamani `accounts.created_at`, paginated (pageSize 1000), via
  `@supabase/supabase-js` (Deno/esm import) using `THAMANI_SUPABASE_URL` +
  `THAMANI_SUPABASE_SERVICE_ROLE_KEY` (function secrets).
- Buckets via the ported pure logic; upserts into `thamani_metrics` using the
  **auto-injected** atlas `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Supabase
  provides these to every Edge Function — no config).
- Returns `{ ok: true, upserted: N }` or `{ ok: false, error }` with a non-2xx
  status so failures show up in `cron.job_run_details`.

Directory:
```
supabase/functions/sync-thamani-metrics/
  index.ts          # handler: auth check → read → bucket → upsert
  lib/types.ts      # ported (copy of lib/thamani/types.ts)
  lib/periods.ts    # ported (copy of lib/thamani/periods.ts)
  lib/bucket.ts     # ported bucketAccounts (from lib/thamani/metrics/accounts.ts)
  lib/bucket_test.ts # Deno test mirroring periods.test.ts assertions
```

### 2. Ported pure logic

`periods.ts` imports only `./types`; `bucketAccounts` imports only periods + types.
Both are pure and already unit-tested — they port to Deno verbatim (change import
extensions to explicit `.ts`). `computeAccountsMetrics` (the client-bound wrapper)
is **not** ported; the Edge Function does its own paginated read.

**Trade-off:** this duplicates ~200 lines of pure logic across the Next app and the
Edge Function. A shared cross-runtime module was rejected because the app uses `@/`
path aliases and the Node supabase client, neither of which resolves in Deno.
Duplication is mitigated by `lib/bucket_test.ts`, which mirrors the existing
`periods.test.ts` assertions so any logic drift fails CI.

### 3. pg_cron schedule (atlas DB)

```sql
select cron.schedule(
  'sync-thamani-metrics',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := <atlas-functions-url>/sync-thamani-metrics,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || <atlas service_role key from Vault>
    )
  );
  $$
);
```

The `service_role` key is read from **Supabase Vault**, not hardcoded. Requires
extensions `pg_cron` and `pg_net` enabled on the atlas project.

## Secrets & access

- Thamani credentials are set by the operator as Edge Function secrets on the atlas
  project (`supabase secrets set THAMANI_SUPABASE_URL=... THAMANI_SUPABASE_SERVICE_ROLE_KEY=...`)
  — **never pasted into chat or committed.**
- atlas `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: auto-injected, no action.
- Provisioning input still needed: the **atlas prod Supabase project ref** to
  apply the migration, deploy the function, and schedule the cron. If not shared,
  the implementation delivers copy-paste `supabase` CLI + SQL commands instead.

## Related fix (in-scope)

`lib/thamani/read.ts` silently ignores query errors. Change the read helpers to
surface/log errors (e.g. `console.error` + non-null-assert removal) so a future
pipeline outage is visible rather than rendering as zeros. This is the exact defect
that hid the current problem.

## Error handling & observability

- Upsert is idempotent → safe every 10 min and safe to overlap the old Vercel cron
  during cutover.
- Edge Function logs (`get_logs` / dashboard) capture per-run detail.
- `cron.job_run_details` records each scheduled run's status for auditing.

## Rollout (ordered)

0. Confirm/apply migration `0024_thamani_metrics` to atlas **prod** DB.
1. Deploy `sync-thamani-metrics`; operator sets Thamani secrets.
2. Manually invoke with the service_role bearer → assert `{ok, upserted:N}` and
   that rows appear in `thamani_metrics`.
3. Enable `pg_cron` + `pg_net`; schedule the job; confirm `cron.job_run_details`
   shows a successful run.
4. Verify the dashboard renders non-zero values.
5. Remove the `thamani-metrics` entry from `vercel.json` and delete
   `app/api/cron/thamani-metrics/route.ts`.

## Testing

- **Unit (Deno):** `lib/bucket_test.ts` mirrors `periods.test.ts` — guards the
  ported logic against drift.
- **Integration (manual):** invoke the deployed function; assert response shape and
  row presence; check `cron.job_run_details` after first scheduled run; confirm
  dashboard shows non-zero.

## Scale note (deferred)

Full recompute re-reads all accounts every 10 min — trivial at current volume.
Revisit with incremental aggregation only if accounts reach ~100k+.
